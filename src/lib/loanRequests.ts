import { supabase } from './supabase'
import { fetchAvailableEquipmentUnit } from './inventory'
import { stampApprovedAgreement } from './loanAgreementApproval'
import { normalizeSerialNumber } from './serialNumber'
import type { LoanRequest, LoanRequestItemRole, LoanRequestStatus } from '../types'

const LOAN_AGREEMENTS_BUCKET = 'loan-agreements'

export interface SubmitLoanRequestItemInput {
  equipmentId: string
  isHardware: boolean
  role: LoanRequestItemRole
  returnDate: string | null // ISO date; hardware only
  signedAgreementFile: File | null // hardware only
  /** What the borrower typed into section 9 — hardware only. */
  signatureName: string | null
  signatureDate: string | null // ISO date
}

export interface AvailabilitySlotInput {
  date: string // ISO date
  hour: number // 0-23
}

export interface SubmitLoanRequestInput {
  userId: string
  items: SubmitLoanRequestItemInput[]
  availability: AvailabilitySlotInput[]
}

// Submits a full checkout: creates the loan_requests row (defaults to
// 'pending'), uploads each hardware item's signed agreement to the private
// loan-agreements bucket, then creates the loan_request_items and
// loan_request_availability rows. Not atomic — Postgres RLS/grants are
// evaluated per request, not a single transaction across storage + two
// tables — so on any failure after the loan_requests row is created, this
// deletes it again (cascading away any items/availability that did land)
// rather than leaving a half-submitted request behind.
export async function submitLoanRequest(input: SubmitLoanRequestInput): Promise<LoanRequest> {
  const { data: requestRow, error: requestError } = await supabase
    .from('loan_requests')
    .insert({ user_id: input.userId })
    .select()
    .single()

  if (requestError) throw requestError
  const request = requestRow as LoanRequest

  try {
    const itemRows = await Promise.all(
      input.items.map(async (item) => {
        const unit = item.isHardware ? await fetchAvailableEquipmentUnit(item.equipmentId) : null

        let signedAgreementPath: string | null = null
        if (item.isHardware && item.signedAgreementFile) {
          signedAgreementPath = `${input.userId}/${request.id}/${item.equipmentId}.pdf`
          const { error: uploadError } = await supabase.storage
            .from(LOAN_AGREEMENTS_BUCKET)
            .upload(signedAgreementPath, item.signedAgreementFile, { contentType: 'application/pdf' })
          if (uploadError) throw uploadError
        }

        return {
          loan_request_id: request.id,
          equipment_id: item.equipmentId,
          equipment_unit_id: unit?.id ?? null,
          item_role: item.role,
          return_date: item.isHardware ? item.returnDate : null,
          signed_agreement_path: signedAgreementPath,
          signature_name: item.isHardware ? item.signatureName : null,
          signature_date: item.isHardware ? item.signatureDate : null,
        }
      }),
    )

    const { error: itemsError } = await supabase.from('loan_request_items').insert(itemRows)
    if (itemsError) throw itemsError

    if (input.availability.length > 0) {
      const { error: availabilityError } = await supabase.from('loan_request_availability').insert(
        input.availability.map((slot) => ({
          loan_request_id: request.id,
          available_date: slot.date,
          available_hour: slot.hour,
        })),
      )
      if (availabilityError) throw availabilityError
    }
  } catch (error) {
    await supabase.from('loan_requests').delete().eq('id', request.id)
    throw error
  }

  return request
}

export interface LoanRequestItemSummary {
  id: string
  equipmentId: string
  itemName: string
  imageUrl: string | null
  status: LoanRequestStatus
  requestedAt: string
  returnDate: string | null
}

// Every equipment item a member has ever requested, newest request first.
// Three plain queries zipped client-side rather than a PostgREST embedded
// select — same reasoning as fetchEquipmentAddonOptions in inventory.ts:
// straightforward FK relationships would probably embed fine, but this
// sidesteps the schema-cache fragility entirely.
export async function fetchLoanRequestItems(userId: string): Promise<LoanRequestItemSummary[]> {
  const { data: requests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id, status, requested_at')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })

  if (requestsError) throw requestsError
  if (!requests || requests.length === 0) return []

  const requestIds = requests.map((request) => request.id)
  const { data: items, error: itemsError } = await supabase
    .from('loan_request_items')
    .select('id, loan_request_id, equipment_id, return_date')
    .in('loan_request_id', requestIds)

  if (itemsError) throw itemsError
  if (!items || items.length === 0) return []

  const equipmentIds = [...new Set(items.map((item) => item.equipment_id))]
  const { data: equipmentRows, error: equipmentError } = await supabase
    .from('equipment')
    .select('id, name, image_url')
    .in('id', equipmentIds)

  if (equipmentError) throw equipmentError

  const requestById = new Map(requests.map((request) => [request.id, request]))
  const equipmentById = new Map((equipmentRows ?? []).map((equipment) => [equipment.id, equipment]))

  const summaries = items.flatMap((item) => {
    const request = requestById.get(item.loan_request_id)
    const equipment = equipmentById.get(item.equipment_id)
    if (!request || !equipment) return []
    return [
      {
        id: item.id,
        equipmentId: item.equipment_id,
        itemName: equipment.name,
        imageUrl: equipment.image_url,
        status: request.status as LoanRequestStatus,
        requestedAt: request.requested_at,
        returnDate: item.return_date,
      },
    ]
  })

  return summaries.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
}

export interface AdminLoanRequestOtherItem {
  /** This sibling's own loan_request_items.id, so the detail screen can
      link straight to it. */
  id: string
  itemName: string
  imageUrl: string | null
  itemRole: LoanRequestItemRole
}

export interface AdminLoanRequestDetail {
  id: string // loan_request_items.id — matches AdminLoanRequestItemSummary.id
  loanRequestId: string
  equipmentId: string
  itemName: string
  itemDescription: string | null
  imageUrl: string | null
  serialNumber: string | null
  itemRole: LoanRequestItemRole
  status: LoanRequestStatus
  requestedAt: string
  returnDate: string | null
  signedAgreementPath: string | null
  /** Section 9 as the borrower filled it in. Null for items submitted before
      the signature was stored — see the 20260923000000 migration. */
  signatureName: string | null
  signatureDate: string | null
  reviewedAt: string | null
  reviewNote: string | null
  returnedAt: string | null
  returnedByName: string | null
  memberId: string
  memberName: string
  memberEmail: string
  /** For the "reach out on Discord or email" step of the checkout process. */
  memberDiscord: string | null
  reviewerName: string | null
  otherItems: AdminLoanRequestOtherItem[]
}

// Full detail for a single loan request item, for the admin loan detail
// screen reached by clicking a row in the "Hardware loans" list. Same
// zipped-plain-queries approach as fetchAllLoanRequestItems, plus the
// sibling items bundled into the same request (so the admin can see the
// full checkout, not just the one item they clicked) and the reviewing
// admin's name if this request has already been reviewed.
export async function fetchLoanRequestItemDetail(itemId: string): Promise<AdminLoanRequestDetail> {
  const { data: item, error: itemError } = await supabase
    .from('loan_request_items')
    .select(
      'id, loan_request_id, equipment_id, equipment_unit_id, item_role, return_date, signed_agreement_path, signature_name, signature_date, returned_at, returned_by',
    )
    .eq('id', itemId)
    .single()
  if (itemError) throw itemError

  const { data: request, error: requestError } = await supabase
    .from('loan_requests')
    .select('id, user_id, status, requested_at, reviewed_at, reviewed_by, review_note')
    .eq('id', item.loan_request_id)
    .single()
  if (requestError) throw requestError

  const { data: equipment, error: equipmentError } = await supabase
    .from('equipment')
    .select('id, name, description, image_url')
    .eq('id', item.equipment_id)
    .single()
  if (equipmentError) throw equipmentError

  let serialNumber: string | null = null
  if (item.equipment_unit_id) {
    const { data: unit, error: unitError } = await supabase
      .from('equipment_units')
      .select('serial_number')
      .eq('id', item.equipment_unit_id)
      .maybeSingle()
    if (unitError) throw unitError
    serialNumber = unit?.serial_number ?? null
  }

  const { data: member, error: memberError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, uw_email, discord')
    .eq('id', request.user_id)
    .single()
  if (memberError) throw memberError

  let reviewerName: string | null = null
  if (request.reviewed_by) {
    const { data: reviewer, error: reviewerError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', request.reviewed_by)
      .maybeSingle()
    if (reviewerError) throw reviewerError
    if (reviewer) reviewerName = `${reviewer.first_name} ${reviewer.last_name}`
  }

  let returnedByName: string | null = null
  if (item.returned_by) {
    const { data: receiver, error: receiverError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', item.returned_by)
      .maybeSingle()
    if (receiverError) throw receiverError
    if (receiver) returnedByName = `${receiver.first_name} ${receiver.last_name}`
  }

  const { data: siblingItems, error: siblingsError } = await supabase
    .from('loan_request_items')
    .select('id, equipment_id, item_role')
    .eq('loan_request_id', item.loan_request_id)
    .neq('id', itemId)
  if (siblingsError) throw siblingsError

  let otherItems: AdminLoanRequestOtherItem[] = []
  if (siblingItems && siblingItems.length > 0) {
    const siblingEquipmentIds = [...new Set(siblingItems.map((sibling) => sibling.equipment_id))]
    const { data: siblingEquipment, error: siblingEquipmentError } = await supabase
      .from('equipment')
      .select('id, name, image_url')
      .in('id', siblingEquipmentIds)
    if (siblingEquipmentError) throw siblingEquipmentError

    const equipmentById = new Map((siblingEquipment ?? []).map((equipmentRow) => [equipmentRow.id, equipmentRow]))
    otherItems = siblingItems.flatMap((sibling) => {
      const equipment = equipmentById.get(sibling.equipment_id)
      return equipment
        ? [
            {
              id: sibling.id,
              itemName: equipment.name,
              imageUrl: equipment.image_url,
              itemRole: sibling.item_role as LoanRequestItemRole,
            },
          ]
        : []
    })
  }

  return {
    id: item.id,
    loanRequestId: item.loan_request_id,
    equipmentId: item.equipment_id,
    itemName: equipment.name,
    itemDescription: equipment.description,
    imageUrl: equipment.image_url,
    serialNumber,
    itemRole: item.item_role as LoanRequestItemRole,
    status: request.status as LoanRequestStatus,
    requestedAt: request.requested_at,
    returnDate: item.return_date,
    signedAgreementPath: item.signed_agreement_path,
    signatureName: item.signature_name,
    signatureDate: item.signature_date,
    reviewedAt: request.reviewed_at,
    reviewNote: request.review_note,
    returnedAt: item.returned_at,
    returnedByName,
    memberId: member.id,
    memberName: `${member.first_name} ${member.last_name}`,
    memberEmail: member.uw_email,
    memberDiscord: member.discord,
    reviewerName,
    otherItems,
  }
}

/**
 * Short-lived signed URL for a private loan-agreements bucket object.
 *
 * `download` asks Storage to serve the object as an attachment rather than
 * inline, which is what the loan detail screen's "Download hardware loan
 * agreement" button wants — without it the browser previews the PDF in a
 * tab, which isn't what the button says it does. It's off by default
 * because handOffLoanRequestItem fetches the same URL to stamp the
 * certificate onto, and that path only wants the bytes.
 */
export async function fetchSignedAgreementUrl(
  path: string,
  options: { download?: boolean } = {},
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(LOAN_AGREEMENTS_BUCKET)
    .createSignedUrl(path, 60 * 5, options.download ? { download: true } : undefined)
  if (error) throw error
  return data.signedUrl
}

export interface AvailabilitySlot {
  date: string // ISO date
  hour: number // 0-23
}

// The pickup-availability grid a member filled out at checkout submission,
// for the admin "view availability" action on a checkout/return-requested
// loan — this is what an admin uses to schedule the hand-off or return.
export async function fetchLoanRequestAvailability(loanRequestId: string): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase
    .from('loan_request_availability')
    .select('available_date, available_hour')
    .eq('loan_request_id', loanRequestId)
    .order('available_date')
    .order('available_hour')

  if (error) throw error
  return (data ?? []).map((row) => ({ date: row.available_date, hour: row.available_hour }))
}

export interface AdminLoanRequestItemSummary {
  id: string
  equipmentId: string
  itemName: string
  imageUrl: string | null
  serialNumber: string | null
  status: LoanRequestStatus
  requestedAt: string
  returnDate: string | null
  returnedAt: string | null
  memberName: string
}

export interface HandOffLoanRequestItemInput {
  itemId: string
  adminId: string
  /** Printed on the approval certificate as who attested the agreement. */
  adminName: string
  /**
   * What the certificate records as the hand-off date. Defaults to now; the
   * hand-off screen passes the date and time the admin typed into section 10
   * of the agreement, which may be when they actually met the member rather
   * than when they got round to recording it. `reviewed_at` stays the real
   * database timestamp either way.
   */
  attestedAt?: Date
}

/**
 * Records a hand-off: stamps a Certificate of Approval onto the member's
 * signed agreement, points the item at that approved copy, and moves the
 * parent request to 'approved' — which is what both dashboards read as "this
 * hardware is out". This is the whole of the hand-off, shared by the two
 * places an admin can perform one: the "Check out hardware" barcode flow
 * off the dashboard and the "Mark as handed off" button on the loan
 * detail screen. Approving in one place must not mean something subtly
 * different from approving in the other, so neither owns a copy of it.
 *
 * Not atomic, for the same reason submitLoanRequest isn't: storage and two
 * tables can't share a transaction from the browser. The order is chosen so
 * a failure leaves the loan un-approved rather than approved with an
 * unstamped agreement — the certificate is uploaded and linked first, and
 * the status moves last.
 */
export async function handOffLoanRequestItem(input: HandOffLoanRequestItemInput): Promise<void> {
  const { data: item, error: itemError } = await supabase
    .from('loan_request_items')
    .select('loan_request_id, equipment_id, equipment_unit_id, signed_agreement_path')
    .eq('id', input.itemId)
    .single()

  if (itemError) throw itemError
  if (!item.signed_agreement_path) {
    throw new Error('This item has no signed agreement to approve.')
  }

  const [{ data: equipment }, unit] = await Promise.all([
    supabase.from('equipment').select('name').eq('id', item.equipment_id).single(),
    item.equipment_unit_id
      ? supabase.from('equipment_units').select('serial_number').eq('id', item.equipment_unit_id).single()
      : Promise.resolve({ data: null }),
  ])

  const approvedAt = new Date()
  const approvedPath = await stampApprovedAgreement({
    agreementUrl: await fetchSignedAgreementUrl(item.signed_agreement_path),
    agreementPath: item.signed_agreement_path,
    itemName: equipment?.name ?? 'this hardware item',
    serialNumber: unit?.data?.serial_number ?? 'Not assigned',
    adminName: input.adminName,
    approvedAt: input.attestedAt ?? approvedAt,
  })

  const { error: itemUpdateError } = await supabase
    .from('loan_request_items')
    .update({ signed_agreement_path: approvedPath })
    .eq('id', input.itemId)
  if (itemUpdateError) throw itemUpdateError

  const { error: requestUpdateError } = await supabase
    .from('loan_requests')
    .update({
      status: 'approved',
      reviewed_at: approvedAt.toISOString(),
      reviewed_by: input.adminId,
    })
    .eq('id', item.loan_request_id)

  if (requestUpdateError) throw requestUpdateError
}

/**
 * Records that a physical item came back. Per item rather than per request:
 * a request can bundle several items with their own return dates, and they
 * come back separately (see the 20260922000000 migration). The parent
 * request stays 'approved' — "is it back?" is answered by returned_at.
 *
 * Setting returned_at is also what fires the member's return-confirmation
 * email and the admin copy, via the trigger in that migration.
 */
export async function markLoanRequestItemReturned(itemId: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('loan_request_items')
    .update({ returned_at: new Date().toISOString(), returned_by: adminId })
    .eq('id', itemId)
    // Guards the double-click and the two-admins-at-once case: the trigger
    // only emails on the null -> set transition anyway, but this also keeps
    // the recorded time and admin the first one, not the last.
    .is('returned_at', null)

  if (error) throw error
}

export type LoanBucket = 'active' | 'overdue' | 'requests' | 'returns' | 'returned'

// Shared by the admin "Hardware loans" list, the loan detail screen and the
// dashboard stat cards so their counts can never drift apart. Denied
// requests never became a loan, so they're excluded entirely (null).
//
// 'returned' is terminal and checked first: an item that came back late is
// returned, not overdue, and nothing about it is outstanding any more.
//
// 'returns' (a member has asked to give something back but hasn't yet) still
// never matches — that's the one step of the flow with no trigger, because
// members have no way to raise a return request in the app yet. The bucket
// is kept for when that's built; the detail screen already renders it.
export function bucketForLoanItem(
  loan: Pick<AdminLoanRequestItemSummary, 'status' | 'returnDate' | 'returnedAt'>,
): LoanBucket | null {
  if (loan.status === 'denied') return null
  if (loan.returnedAt) return 'returned'
  if (loan.status === 'pending') return 'requests'
  if (loan.returnDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const returnDate = new Date(`${loan.returnDate}T00:00:00`)
    if (returnDate < today) return 'overdue'
  }
  return 'active'
}

// Every equipment item ever requested, across all members — the admin
// "Hardware loans" list. Same zipped-plain-queries approach as
// fetchLoanRequestItems, plus equipment_units (for the serial shown under
// the item name) and profiles (for the requesting member's name); admins
// can read every row of all four tables per their RLS policies.
export async function fetchAllLoanRequestItems(): Promise<AdminLoanRequestItemSummary[]> {
  const { data: requests, error: requestsError } = await supabase
    .from('loan_requests')
    .select('id, user_id, status, requested_at')
    .order('requested_at', { ascending: false })

  if (requestsError) throw requestsError
  if (!requests || requests.length === 0) return []

  const requestIds = requests.map((request) => request.id)
  const { data: items, error: itemsError } = await supabase
    .from('loan_request_items')
    .select('id, loan_request_id, equipment_id, equipment_unit_id, return_date, returned_at')
    .in('loan_request_id', requestIds)

  if (itemsError) throw itemsError
  if (!items || items.length === 0) return []

  const equipmentIds = [...new Set(items.map((item) => item.equipment_id))]
  const { data: equipmentRows, error: equipmentError } = await supabase
    .from('equipment')
    .select('id, name, image_url')
    .in('id', equipmentIds)

  if (equipmentError) throw equipmentError

  const unitIds = items
    .map((item) => item.equipment_unit_id)
    .filter((id): id is string => Boolean(id))

  let unitRows: { id: string; serial_number: string }[] = []
  if (unitIds.length > 0) {
    const { data, error } = await supabase
      .from('equipment_units')
      .select('id, serial_number')
      .in('id', [...new Set(unitIds)])
    if (error) throw error
    unitRows = data ?? []
  }

  const userIds = [...new Set(requests.map((request) => request.user_id))]
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', userIds)

  if (profileError) throw profileError

  const requestById = new Map(requests.map((request) => [request.id, request]))
  const equipmentById = new Map((equipmentRows ?? []).map((equipment) => [equipment.id, equipment]))
  const unitById = new Map(unitRows.map((unit) => [unit.id, unit]))
  const profileById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]))

  const summaries = items.flatMap((item) => {
    const request = requestById.get(item.loan_request_id)
    const equipment = equipmentById.get(item.equipment_id)
    if (!request || !equipment) return []
    const profile = profileById.get(request.user_id)
    const unit = item.equipment_unit_id ? unitById.get(item.equipment_unit_id) : undefined

    return [
      {
        id: item.id,
        equipmentId: item.equipment_id,
        itemName: equipment.name,
        imageUrl: equipment.image_url,
        serialNumber: unit?.serial_number ?? null,
        status: request.status as LoanRequestStatus,
        requestedAt: request.requested_at,
        returnDate: item.return_date,
        returnedAt: item.returned_at,
        memberName: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown member',
      },
    ]
  })

  return summaries.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
}

// ── Resolving a scanned barcode to a checkout ────────────────────────────

/**
 * What a serial number means for the admin "check out hardware" flow.
 *
 * 'no_match' is deliberately not the end of the story: it says only that no
 * loan in the list is about this unit, which reads very differently
 * depending on whether the unit exists at all. The scan screen asks
 * inventory (fetchEquipmentUnitBySerial) before it says anything, so a label
 * off some other club's hardware isn't reported as "nobody requested it".
 */
export type CheckoutMatchOutcome =
  /** A member has requested this unit and is waiting to be handed it. */
  | 'ready'
  /** It's already out on a loan nobody has recorded a return for. */
  | 'already_out'
  /** No open request in the list is about this unit. */
  | 'no_match'

export interface CheckoutMatch {
  outcome: CheckoutMatchOutcome
  /** The normalised serial that was looked up, as stored. */
  serial: string
  /** The loan the outcome is about — null when nothing matched. */
  loan: AdminLoanRequestItemSummary | null
}

/**
 * Picks the one loan a scanned serial is about, out of every loan item ever
 * recorded. A single physical unit accumulates rows over its life — lent,
 * returned, lent again — so "the loan for this serial" is a choice, not a
 * lookup, and this makes it once for the scan, the typed serial and the
 * database picker alike.
 *
 * An outstanding request wins over everything: that's what the admin is
 * standing there to do. Only if there is none does an un-returned loan
 * matter, and then only to say no — a unit that is already out cannot be
 * handed over again, and telling the admin who has it is more use than
 * telling them the scan failed. Closed loans are history and never match.
 */
export function matchCheckoutSerial(
  loans: AdminLoanRequestItemSummary[],
  serial: string,
): CheckoutMatch {
  const forUnit = loans.filter(
    (loan) => loan.serialNumber && normalizeSerialNumber(loan.serialNumber) === serial,
  )

  // fetchAllLoanRequestItems returns newest request first, and filter keeps
  // that order, so the first match of a kind is the most recent one.
  const requested = forUnit.find((loan) => bucketForLoanItem(loan) === 'requests')
  if (requested) return { outcome: 'ready', serial, loan: requested }

  const out = forUnit.find((loan) => {
    const bucket = bucketForLoanItem(loan)
    return bucket === 'active' || bucket === 'overdue'
  })
  if (out) return { outcome: 'already_out', serial, loan: out }

  return { outcome: 'no_match', serial, loan: null }
}

/**
 * What a serial number means for the admin "return hardware" flow — the
 * mirror of matchCheckoutSerial, asked in the other direction.
 *
 * 'no_match' again says only that no loan in the list is about this unit,
 * which the scan screen resolves against inventory before it says anything.
 */
export type ReturnMatchOutcome =
  /** It's out with someone and hasn't been recorded back yet. */
  | 'ready'
  /** Requested but never handed over, so there is nothing to give back. */
  | 'not_handed_over'
  /** No open loan in the list is about this unit. */
  | 'no_match'

export interface ReturnMatch {
  outcome: ReturnMatchOutcome
  /** The normalised serial that was looked up, as stored. */
  serial: string
  /** The loan the outcome is about — null when nothing matched. */
  loan: AdminLoanRequestItemSummary | null
}

/**
 * Picks the one loan a serial is about for a return. An outstanding loan
 * wins: that's the hardware being handed back, whether it's due next week or
 * was due last month. Only if there is none does an unfulfilled request
 * matter, and then only to explain the refusal — hardware that was never
 * collected cannot be returned, and saying so beats "not out on loan", which
 * would send an admin looking for a record that does exist.
 *
 * Loans already recorded as returned never match, so scanning the same unit
 * twice is a refusal rather than a second return. markLoanRequestItemReturned
 * guards the write for the same reason; this is the half the admin sees.
 */
export function matchReturnSerial(
  loans: AdminLoanRequestItemSummary[],
  serial: string,
): ReturnMatch {
  const forUnit = loans.filter(
    (loan) => loan.serialNumber && normalizeSerialNumber(loan.serialNumber) === serial,
  )

  // fetchAllLoanRequestItems returns newest request first, and filter keeps
  // that order, so the first match of a kind is the most recent one.
  const out = forUnit.find((loan) => {
    const bucket = bucketForLoanItem(loan)
    return bucket === 'active' || bucket === 'overdue'
  })
  if (out) return { outcome: 'ready', serial, loan: out }

  const requested = forUnit.find((loan) => bucketForLoanItem(loan) === 'requests')
  if (requested) return { outcome: 'not_handed_over', serial, loan: requested }

  return { outcome: 'no_match', serial, loan: null }
}

/** True for a loan whose return date has already passed. */
export function isOverdue(loan: Pick<AdminLoanRequestItemSummary, 'status' | 'returnDate' | 'returnedAt'>): boolean {
  return bucketForLoanItem(loan) === 'overdue'
}
