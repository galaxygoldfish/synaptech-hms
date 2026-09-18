import { supabase } from './supabase'
import type { LoanRequestItemRole, LoanRequestStatus } from '../types'

/**
 * The member's own view of their loans — "My hardware loans" and the detail
 * screen behind each row.
 *
 * Separate from loanRequests.ts, which answers the admin's questions about
 * everybody's loans. A member asks different ones: what is this thing, where
 * is my agreement, can I still call this off, when do I have to bring it
 * back. Same tables, different shape, and keeping them apart means the
 * admin's list can't quietly start deciding what a member is shown.
 */

/**
 * What a member's loan is doing right now, in the terms their screen speaks.
 *
 * Deliberately finer-grained than the admin's LoanBucket: 'return_soon' and
 * 'overdue' are both an admin's "still out", but to the person holding the
 * hardware they are a reminder and a problem, and the screen colours them
 * accordingly.
 */
export type MemberLoanState =
  /** Submitted, waiting for an admin to hand it over. Cancellable. */
  | 'checkout_requested'
  /** The member called it off before it was handed over. */
  | 'cancelled'
  /** An admin turned it down. */
  | 'denied'
  /** Out with the member, nothing due soon. */
  | 'active'
  /** Out, and due back inside a week. */
  | 'return_soon'
  /** The member has asked to give it back; an admin hasn't checked it in yet. */
  | 'return_requested'
  /** Out, and past its return date. */
  | 'overdue'
  /** Back on the shelf. */
  | 'returned'

/** How close to the return date counts as "return soon". */
export const RETURN_SOON_DAYS = 7

export interface MemberLoanItem {
  /** loan_request_items.id — what the detail route is keyed on. */
  id: string
  loanRequestId: string
  equipmentId: string
  itemName: string
  itemDescription: string | null
  imageUrl: string | null
  documentationUrl: string | null
  /** Consumables are kept, not returned, and have no serial or return date. */
  isConsumable: boolean
  itemRole: LoanRequestItemRole
  serialNumber: string | null
  requestStatus: LoanRequestStatus
  requestedAt: string
  /** When an admin approved and handed it over — the "checked out on" date. */
  reviewedAt: string | null
  returnDate: string | null
  returnRequestedAt: string | null
  returnedAt: string | null
  /** Whatever copy exists: the member's signed PDF, or the countersigned one. */
  signedAgreementPath: string | null
}

/**
 * One checkout submission and everything in it — the primary item first, then
 * its add-ons in the order the wireframes indent them.
 *
 * Grouped because that's how a member reads the screen and how cancelling
 * works: the Cancel button sits on the primary row and calls off the whole
 * request, add-ons included, because the request is what was submitted.
 */
export interface MemberLoanGroup {
  loanRequestId: string
  requestedAt: string
  primary: MemberLoanItem
  addOns: MemberLoanItem[]
}

/** Add-ons after the primary, and otherwise the order they were created. */
const ROLE_ORDER: Record<LoanRequestItemRole, number> = {
  primary: 0,
  required_addon: 1,
  optional_addon: 2,
}

/**
 * What state one item is in. Pure, so the screens, their tests and any future
 * caller all read the same rules.
 *
 * Order matters and is the argument: returned is terminal and wins over
 * everything (hardware handed back late is returned, not overdue — nothing
 * about it is outstanding). A pending request is only ever "requested",
 * whatever its return date says, because nobody has the hardware yet.
 */
export function memberLoanState(item: MemberLoanItem, now: Date = new Date()): MemberLoanState {
  if (item.requestStatus === 'cancelled') return 'cancelled'
  if (item.requestStatus === 'denied') return 'denied'
  if (item.returnedAt) return 'returned'
  if (item.requestStatus === 'pending') return 'checkout_requested'

  // Approved and still out.
  if (item.returnRequestedAt) return 'return_requested'
  // Consumables are kept — there is no date for them to be late against.
  if (!item.returnDate) return 'active'

  const due = new Date(`${item.returnDate}T00:00:00`)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (due < today) return 'overdue'

  const soonest = new Date(today)
  soonest.setDate(soonest.getDate() + RETURN_SOON_DAYS)
  return due <= soonest ? 'return_soon' : 'active'
}

/** True once the hardware is the member's problem rather than a pending ask. */
export function isOutWithMember(state: MemberLoanState): boolean {
  return (
    state === 'active' || state === 'return_soon' || state === 'return_requested' || state === 'overdue'
  )
}

/**
 * How a loan is coloured on the member's home screen — the "My hardware"
 * cards.
 *
 * Deliberately not memberLoanState: the home screen is stricter about the
 * due date. Hardware due *today* is already overdue here (the card is red and
 * new checkouts are blocked), where the loans list only calls it overdue once
 * the date has passed. Date alone decides it, so a loan the member has asked
 * to return still counts as overdue until an admin actually checks it in.
 */
export type HomeLoanTone = 'active' | 'due_soon' | 'overdue'

export function homeLoanTone(item: MemberLoanItem, now: Date = new Date()): HomeLoanTone {
  if (!item.returnDate) return 'active'

  const due = new Date(`${item.returnDate}T00:00:00`)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (due <= today) return 'overdue'

  const soonest = new Date(today)
  soonest.setDate(soonest.getDate() + RETURN_SOON_DAYS)
  return due <= soonest ? 'due_soon' : 'active'
}

interface ItemRow {
  id: string
  loan_request_id: string
  equipment_id: string
  equipment_unit_id: string | null
  item_role: string
  return_date: string | null
  returned_at: string | null
  return_requested_at: string | null
  signed_agreement_path: string | null
}

interface RequestRow {
  id: string
  status: string
  requested_at: string
  reviewed_at: string | null
}

/**
 * Zips the four tables a member's list needs into MemberLoanItems.
 *
 * Plain queries joined client-side rather than a PostgREST embedded select —
 * the same reasoning as fetchLoanRequestItems and fetchEquipmentAddonOptions:
 * these relationships would probably embed fine, but doing it this way
 * sidesteps schema-cache fragility entirely.
 */
async function hydrateItems(requests: RequestRow[], items: ItemRow[]): Promise<MemberLoanItem[]> {
  if (items.length === 0) return []

  const equipmentIds = [...new Set(items.map((item) => item.equipment_id))]
  const { data: equipmentRows, error: equipmentError } = await supabase
    .from('equipment')
    .select('id, name, description, image_url, product_type, documentation_url')
    .in('id', equipmentIds)
  if (equipmentError) throw equipmentError

  const unitIds = items.map((item) => item.equipment_unit_id).filter((id): id is string => Boolean(id))
  let unitRows: { id: string; serial_number: string }[] = []
  if (unitIds.length > 0) {
    const { data, error } = await supabase
      .from('equipment_units')
      .select('id, serial_number')
      .in('id', [...new Set(unitIds)])
    if (error) throw error
    unitRows = data ?? []
  }

  const requestById = new Map(requests.map((request) => [request.id, request]))
  const equipmentById = new Map((equipmentRows ?? []).map((equipment) => [equipment.id, equipment]))
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]))

  return items.flatMap((item) => {
    const request = requestById.get(item.loan_request_id)
    const equipment = equipmentById.get(item.equipment_id)
    if (!request || !equipment) return []

    return [
      {
        id: item.id,
        loanRequestId: item.loan_request_id,
        equipmentId: item.equipment_id,
        itemName: equipment.name,
        itemDescription: equipment.description,
        imageUrl: equipment.image_url,
        documentationUrl: equipment.documentation_url,
        isConsumable: equipment.product_type === 'consumable',
        itemRole: item.item_role as LoanRequestItemRole,
        serialNumber: item.equipment_unit_id
          ? (unitById.get(item.equipment_unit_id)?.serial_number ?? null)
          : null,
        requestStatus: request.status as LoanRequestStatus,
        requestedAt: request.requested_at,
        reviewedAt: request.reviewed_at,
        returnDate: item.return_date,
        returnRequestedAt: item.return_requested_at,
        returnedAt: item.returned_at,
        signedAgreementPath: item.signed_agreement_path,
      },
    ]
  })
}

const ITEM_COLUMNS =
  'id, loan_request_id, equipment_id, equipment_unit_id, item_role, return_date, returned_at, return_requested_at, signed_agreement_path'

/**
 * Everything a member has ever checked out, newest request first, grouped by
 * the submission it belonged to.
 *
 * A request with no primary item is dropped rather than rendered headless:
 * every submission has one by construction (see submitLoanRequest), so a
 * group without one is a broken row, and showing add-ons floating with
 * nothing to indent under would be worse than showing nothing.
 */
export async function fetchMemberLoans(userId: string): Promise<MemberLoanGroup[]> {
  const { data: requests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id, status, requested_at, reviewed_at')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })

  if (requestsError) throw requestsError
  if (!requests || requests.length === 0) return []

  const { data: items, error: itemsError } = await supabase
    .from('loan_request_items')
    .select(ITEM_COLUMNS)
    .in(
      'loan_request_id',
      requests.map((request) => request.id),
    )
    .order('created_at')

  if (itemsError) throw itemsError

  const hydrated = await hydrateItems(requests as RequestRow[], (items ?? []) as ItemRow[])
  const byRequest = new Map<string, MemberLoanItem[]>()
  for (const item of hydrated) {
    const bucket = byRequest.get(item.loanRequestId)
    if (bucket) bucket.push(item)
    else byRequest.set(item.loanRequestId, [item])
  }

  return requests.flatMap((request) => {
    const group = (byRequest.get(request.id) ?? []).sort(
      (a, b) => ROLE_ORDER[a.itemRole] - ROLE_ORDER[b.itemRole],
    )
    const primary = group.find((item) => item.itemRole === 'primary')
    if (!primary) return []

    return [
      {
        loanRequestId: request.id,
        requestedAt: request.requested_at,
        primary,
        addOns: group.filter((item) => item.itemRole !== 'primary'),
      },
    ]
  })
}

/**
 * The hardware a member currently has out — what "My hardware" on the home
 * screen lists. Every item, add-ons included, that has been handed over and
 * not yet checked back in. Consumables are kept rather than lent, so they are
 * not loans and never appear here.
 *
 * Soonest due first, which puts anything overdue at the front.
 */
export async function fetchActiveHardwareLoans(userId: string): Promise<MemberLoanItem[]> {
  const groups = await fetchMemberLoans(userId)
  return groups
    .flatMap((group) => [group.primary, ...group.addOns])
    .filter((item) => !item.isConsumable && isOutWithMember(memberLoanState(item)))
    .sort((a, b) => (a.returnDate ?? '9999-12-31').localeCompare(b.returnDate ?? '9999-12-31'))
}

/** One item, for the detail screen behind a row. */
export async function fetchMemberLoanItem(itemId: string): Promise<MemberLoanItem> {
  const { data: item, error: itemError } = await supabase
    .from('loan_request_items')
    .select(ITEM_COLUMNS)
    .eq('id', itemId)
    .single()
  if (itemError) throw itemError

  const { data: request, error: requestError } = await supabase
    .from('loan_requests')
    .select('id, status, requested_at, reviewed_at')
    .eq('id', (item as ItemRow).loan_request_id)
    .single()
  if (requestError) throw requestError

  const [hydrated] = await hydrateItems([request as RequestRow], [item as ItemRow])
  if (!hydrated) throw new Error('This loan could not be loaded.')
  return hydrated
}

/**
 * Calls off a checkout request that hasn't been handed over yet.
 *
 * Per request, not per item: the Cancel button sits on the primary row but
 * the thing being called off is the whole submission, add-ons included —
 * they were asked for together and there is no way to collect half of one.
 *
 * The `.eq('status', 'pending')` is the same guard the RLS policy applies,
 * repeated here so a request approved while the member sat on the screen
 * updates nothing rather than being refused as a permissions error. The
 * caller re-reads either way.
 */
export async function cancelLoanRequest(loanRequestId: string): Promise<void> {
  const { error } = await supabase
    .from('loan_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', loanRequestId)
    .eq('status', 'pending')

  if (error) throw error
}
