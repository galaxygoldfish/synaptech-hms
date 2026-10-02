import { supabase } from './supabase'
import { fetchAvailableEquipmentUnit } from './inventory'
import { isApprovedAgreementPath, stampApprovedAgreement } from './loanAgreementApproval'
import { CACHE_KEYS, invalidate, peekValue, refresh, DISPLAY_REUSE_MS } from './queryCache'
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
  /**
   * The unit the borrower signed the agreement for — hardware only. Omit to
   * have one picked at submission.
   */
  equipmentUnitId?: string | null
}

// Another member's request took the unit first (or every unit is spoken for).
export class UnitUnavailableError extends Error {
  constructor(message = 'That hardware was just requested by someone else.') {
    super(message)
    this.name = 'UnitUnavailableError'
  }
}

/**
 * A hand-off or return that the database says has already happened, or can
 * no longer happen — typically a second admin acting on a loan a colleague
 * has just dealt with. The message is written for the admin to read as-is.
 */
export class LoanConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanConflictError'
  }
}

async function profileName(id: string | null): Promise<string | null> {
  if (!id) return null
  const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', id).maybeSingle()
  return data ? `${data.first_name} ${data.last_name}` : null
}

async function alreadyHandedOff(loanRequestId: string): Promise<LoanConflictError> {
  const { data } = await supabase.from('loan_requests').select('reviewed_by').eq('id', loanRequestId).maybeSingle()
  const name = await profileName(data?.reviewed_by ?? null)
  return new LoanConflictError(
    name ? `This hardware has already been checked out by ${name}.` : 'This hardware has already been checked out.',
  )
}

function isUnitUnavailable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && String(error.message).includes('unit_unavailable')
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
  // Invalidated whether or not the submission lands: a failure part-way
  // deletes the request again, but either way the member's list and the free
  // unit counts changed or may have.
  try {
    return await submit(input)
  } finally {
    invalidate(CACHE_KEYS.memberLoans)
    invalidate(CACHE_KEYS.equipmentAvailability)
  }
}

async function submit(input: SubmitLoanRequestInput): Promise<LoanRequest> {
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
        let unitId: string | null = null
        if (item.isHardware) {
          unitId = item.equipmentUnitId ?? (await fetchAvailableEquipmentUnit(item.equipmentId))?.id ?? null
          // No free unit means no request: every serial of this product is
          // already on someone else's pending or approved request.
          if (!unitId) throw new UnitUnavailableError('No units of this hardware are currently available.')
        }

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
          equipment_unit_id: unitId,
          item_role: item.role,
          return_date: item.isHardware ? item.returnDate : null,
          signed_agreement_path: signedAgreementPath,
          signature_name: item.isHardware ? item.signatureName : null,
          signature_date: item.isHardware ? item.signatureDate : null,
        }
      }),
    )

    const { error: itemsError } = await supabase.from('loan_request_items').insert(itemRows)
    if (itemsError) throw isUnitUnavailable(itemsError) ? new UnitUnavailableError() : itemsError

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
  /** Set when the member asked to give it back; cleared only by checking in. */
  returnRequestedAt: string | null
  returnedAt: string | null
  returnedByName: string | null
  memberId: string
  memberName: string
  memberEmail: string
  /** For the "reach out on Discord or email" step of the checkout process. */
  memberDiscord: string | null
  reviewerName: string | null
  /** Set when the request was cancelled — by the member or by an admin. */
  cancelledAt: string | null
  cancelledByName: string | null
  /** Only an admin's cancellation carries one; see cancelLoanRequestAsAdmin. */
  cancellationReason: string | null
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
      'id, loan_request_id, equipment_id, equipment_unit_id, item_role, return_date, signed_agreement_path, signature_name, signature_date, return_requested_at, returned_at, returned_by',
    )
    .eq('id', itemId)
    .single()
  if (itemError) throw itemError

  // Everything below depends only on the item row, or on the request row,
  // so it's fetched in dependency waves rather than one query at a time:
  // the request and the member/reviewer names behind it form one chain, and
  // the equipment, serial, receiver and sibling items run alongside it.
  const fullName = (row: { first_name: string; last_name: string } | null) =>
    row ? `${row.first_name} ${row.last_name}` : null

  const requestChain = (async () => {
    const { data: request, error: requestError } = await supabase
      .from('loan_requests')
      .select('id, user_id, status, requested_at, reviewed_at, reviewed_by, review_note, cancelled_at, cancelled_by, cancellation_reason')
      .eq('id', item.loan_request_id)
      .single()
    if (requestError) throw requestError

    const [memberResult, reviewerResult, cancellerResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, uw_email, discord')
        .eq('id', request.user_id)
        .single(),
      request.reviewed_by
        ? supabase.from('profiles').select('first_name, last_name').eq('id', request.reviewed_by).maybeSingle()
        : null,
      request.cancelled_by
        ? supabase.from('profiles').select('first_name, last_name').eq('id', request.cancelled_by).maybeSingle()
        : null,
    ])
    if (memberResult.error) throw memberResult.error
    if (reviewerResult?.error) throw reviewerResult.error
    if (cancellerResult?.error) throw cancellerResult.error

    return {
      request,
      member: memberResult.data,
      reviewerName: fullName(reviewerResult?.data ?? null),
      cancelledByName: fullName(cancellerResult?.data ?? null),
    }
  })()

  const siblingsChain = (async (): Promise<AdminLoanRequestOtherItem[]> => {
    const { data: siblingItems, error: siblingsError } = await supabase
      .from('loan_request_items')
      .select('id, equipment_id, item_role')
      .eq('loan_request_id', item.loan_request_id)
      .neq('id', itemId)
    if (siblingsError) throw siblingsError
    if (!siblingItems || siblingItems.length === 0) return []

    const siblingEquipmentIds = [...new Set(siblingItems.map((sibling) => sibling.equipment_id))]
    const { data: siblingEquipment, error: siblingEquipmentError } = await supabase
      .from('equipment')
      .select('id, name, image_url')
      .in('id', siblingEquipmentIds)
    if (siblingEquipmentError) throw siblingEquipmentError

    const equipmentById = new Map((siblingEquipment ?? []).map((equipmentRow) => [equipmentRow.id, equipmentRow]))
    return siblingItems.flatMap((sibling) => {
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
  })()

  const [
    { request, member, reviewerName, cancelledByName },
    otherItems,
    equipmentResult,
    unitResult,
    receiverResult,
  ] = await Promise.all([
    requestChain,
    siblingsChain,
    supabase.from('equipment').select('id, name, description, image_url').eq('id', item.equipment_id).single(),
    item.equipment_unit_id
      ? supabase.from('equipment_units').select('serial_number').eq('id', item.equipment_unit_id).maybeSingle()
      : null,
    item.returned_by
      ? supabase.from('profiles').select('first_name, last_name').eq('id', item.returned_by).maybeSingle()
      : null,
  ])
  if (equipmentResult.error) throw equipmentResult.error
  if (unitResult?.error) throw unitResult.error
  if (receiverResult?.error) throw receiverResult.error

  const equipment = equipmentResult.data
  const serialNumber = unitResult?.data?.serial_number ?? null
  const returnedByName = fullName(receiverResult?.data ?? null)

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
    returnRequestedAt: item.return_requested_at,
    returnedAt: item.returned_at,
    returnedByName,
    memberId: member.id,
    memberName: `${member.first_name} ${member.last_name}`,
    memberEmail: member.uw_email,
    memberDiscord: member.discord,
    reviewerName,
    cancelledAt: request.cancelled_at,
    cancelledByName,
    cancellationReason: request.cancellation_reason,
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
 * because handOffLoanRequestItem fetches the same URL to fill in section 10
 * of, and that path only wants the bytes.
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
  /** Set when the member asked to give it back; cleared only by checking in. */
  returnRequestedAt: string | null
  returnedAt: string | null
  /** Set once the request is cancelled, by the member or an admin. */
  cancelledAt: string | null
  memberName: string
}

export interface HandOffLoanRequestItemInput {
  itemId: string
  adminId: string
  /** Printed into section 10's "Receiving Hardware Manager name" cell. */
  adminName: string
  /**
   * What section 10 records as the received date/time. Defaults to now; the
   * hand-off screen passes the date and time the admin typed into section 10
   * of the agreement, which may be when they actually met the member rather
   * than when they got round to recording it. `reviewed_at` stays the real
   * database timestamp either way.
   */
  attestedAt?: Date
}

/**
 * Records a hand-off: fills in section 10 of the member's signed agreement
 * (received date, received time, receiving Hardware Manager name), points
 * the item at that stamped copy, and moves the parent request to 'approved'
 * — which is what both dashboards read as "this hardware is out". This is
 * the whole of the hand-off, shared by the two places an admin can perform
 * one: the "Check out hardware" barcode flow off the dashboard and the
 * "Mark as handed off" button on the loan detail screen. Approving in one
 * place must not mean something subtly different from approving in the
 * other, so neither owns a copy of it.
 *
 * Not atomic, for the same reason submitLoanRequest isn't: storage and two
 * tables can't share a transaction from the browser. The order is chosen so
 * a failure leaves the loan un-approved rather than approved with an
 * unstamped agreement — the stamped copy is uploaded and linked first, and
 * the status moves last.
 *
 * Guarded against a second admin handing off the same item: throws
 * LoanConflictError rather than stamping a second certificate over the
 * first. "Already handed off" is judged per item (its agreement already
 * points at a stamped copy), not by the request's status — a request
 * bundling several items is approved by its first hand-off, and the others
 * are still handed off after it. The check is made up front, before anything
 * is written, and again as a compare-and-set on the item row, so of two
 * admins confirming at nearly the same moment only one update matches.
 */
export async function handOffLoanRequestItem(input: HandOffLoanRequestItemInput): Promise<void> {
  // Invalidated whether or not every step lands: a failure part-way can
  // still have written something, and a refetch is cheap.
  try {
    await handOff(input)
  } finally {
    invalidate(CACHE_KEYS.adminLoans)
    // Checked-out counts and unit statuses on the inventory screens.
    invalidate(CACHE_KEYS.equipmentAll)
  }
}

async function handOff(input: HandOffLoanRequestItemInput): Promise<void> {
  const { data: item, error: itemError } = await supabase
    .from('loan_request_items')
    .select('loan_request_id, signed_agreement_path')
    .eq('id', input.itemId)
    .single()

  if (itemError) throw itemError
  if (!item.signed_agreement_path) {
    throw new Error('This item has no signed agreement to approve.')
  }

  const { data: request, error: requestError } = await supabase
    .from('loan_requests')
    .select('status')
    .eq('id', item.loan_request_id)
    .single()
  if (requestError) throw requestError

  if (request.status === 'cancelled') {
    throw new LoanConflictError('The member cancelled this request, so there is nothing to hand over.')
  }
  if (request.status === 'denied') {
    throw new LoanConflictError('This request was denied, so there is nothing to hand over.')
  }

  const alreadyStamped = isApprovedAgreementPath(item.signed_agreement_path)
  if (alreadyStamped && request.status === 'approved') {
    throw await alreadyHandedOff(item.loan_request_id)
  }

  const approvedAt = new Date()

  // Stamped but still pending means an earlier attempt got as far as the
  // certificate and failed before the status moved. Finish that one rather
  // than stamping again.
  if (!alreadyStamped) {
    const approvedPath = await stampApprovedAgreement({
      agreementUrl: await fetchSignedAgreementUrl(item.signed_agreement_path),
      agreementPath: item.signed_agreement_path,
      managerName: input.adminName,
      receivedAt: input.attestedAt ?? approvedAt,
    })

    // Compare-and-set: only repoint the item if it still points at the
    // unstamped agreement read above. If another admin got there first,
    // nothing matches and this admin is told so.
    const { data: claimed, error: itemUpdateError } = await supabase
      .from('loan_request_items')
      .update({ signed_agreement_path: approvedPath })
      .eq('id', input.itemId)
      .eq('signed_agreement_path', item.signed_agreement_path)
      .select('id')
    if (itemUpdateError) throw itemUpdateError
    if (!claimed || claimed.length === 0) throw await alreadyHandedOff(item.loan_request_id)
  }

  const { data: approved, error: requestUpdateError } = await supabase
    .from('loan_requests')
    .update({
      status: 'approved',
      reviewed_at: approvedAt.toISOString(),
      reviewed_by: input.adminId,
    })
    .eq('id', item.loan_request_id)
    // Not a cancellation that landed while the certificate was being made.
    .in('status', ['pending', 'approved'])
    .select('id')

  if (requestUpdateError) throw requestUpdateError
  if (!approved || approved.length === 0) {
    throw new LoanConflictError('The member cancelled this request while the hand-off was being recorded.')
  }
}

/**
 * Records that a physical item came back. Per item rather than per request:
 * a request can bundle several items with their own return dates, and they
 * come back separately (see the 20260922000000 migration). The parent
 * request stays 'approved' — "is it back?" is answered by returned_at.
 *
 * Setting returned_at is also what fires the member's return-confirmation
 * email and the admin copy, via the trigger in that migration.
 *
 * Throws LoanConflictError if the item was already recorded as returned: a
 * second admin checking in hardware a colleague has just taken back should
 * be told, not shown a success for a write that didn't happen.
 */
export async function markLoanRequestItemReturned(itemId: string, adminId: string): Promise<void> {
  const { data: updated, error } = await supabase
    .from('loan_request_items')
    .update({ returned_at: new Date().toISOString(), returned_by: adminId })
    .eq('id', itemId)
    // Guards the double-click and the two-admins-at-once case: the trigger
    // only emails on the null -> set transition anyway, but this also keeps
    // the recorded time and admin the first one, not the last.
    .is('returned_at', null)
    .select('id')

  invalidate(CACHE_KEYS.adminLoans)
  // Checked-out counts and unit statuses on the inventory screens.
  invalidate(CACHE_KEYS.equipmentAll)
  if (error) throw error

  if (!updated || updated.length === 0) {
    const { data: item } = await supabase
      .from('loan_request_items')
      .select('returned_by')
      .eq('id', itemId)
      .maybeSingle()
    const name = await profileName(item?.returned_by ?? null)
    throw new LoanConflictError(
      name ? `This hardware was already checked in by ${name}.` : 'This hardware was already checked in.',
    )
  }
}

/**
 * An admin calling off a checkout request before it's handed over, with the
 * reason the member is emailed (checkout-request-cancellation).
 *
 * Per request, not per item, exactly like the member's own cancel
 * (cancelLoanRequest in memberLoans.ts): the status lives on the request,
 * and there is no way to hand over half a submission. Who cancelled and
 * when are stamped by the database, and the email is sent by its trigger —
 * see the 20261002000000 migration — so the reason is all this writes.
 *
 * Compare-and-set on 'pending', like the hand-off: if a colleague handed it
 * over, or the member cancelled it themselves, while this admin was typing
 * the reason, nothing matches and they're told which.
 */
export async function cancelLoanRequestAsAdmin(loanRequestId: string, reason: string): Promise<void> {
  const { data: cancelled, error } = await supabase
    .from('loan_requests')
    .update({ status: 'cancelled', cancellation_reason: reason.trim(), updated_at: new Date().toISOString() })
    .eq('id', loanRequestId)
    .eq('status', 'pending')
    .select('id')

  invalidate(CACHE_KEYS.adminLoans)
  // Cancelling releases the request's units.
  invalidate(CACHE_KEYS.equipmentAll)
  if (error) throw error

  if (!cancelled || cancelled.length === 0) {
    const { data: request } = await supabase
      .from('loan_requests')
      .select('status')
      .eq('id', loanRequestId)
      .maybeSingle()
    if (request?.status === 'approved') throw await alreadyHandedOff(loanRequestId)
    if (request?.status === 'cancelled') throw new LoanConflictError('This request has already been cancelled.')
    if (request?.status === 'denied') throw new LoanConflictError('This request was already denied.')
    throw new LoanConflictError('This request can no longer be cancelled.')
  }
}

export type LoanBucket = 'active' | 'overdue' | 'requests' | 'returns' | 'returned'

// Shared by the admin "Hardware loans" list, the loan detail screen and the
// dashboard stat cards so their counts can never drift apart. Denied and
// cancelled requests never became a loan, so they're excluded entirely
// (null) — one was refused by an admin, the other called off by the member.
//
// 'returned' is terminal and checked first: an item that came back late is
// returned, not overdue, and nothing about it is outstanding any more.
//
// 'returns' (a member has asked to give something back but hasn't yet) is
// answered by return_requested_at, added in the 20260925000000 migration and
// set by the member-facing return flow (ReturnAvailability.tsx) — so the
// list, the counts and the member's badge all agree once a request comes in.
export function bucketForLoanItem(
  loan: Pick<
    AdminLoanRequestItemSummary,
    'status' | 'returnDate' | 'returnedAt' | 'returnRequestedAt'
  >,
): LoanBucket | null {
  if (loan.status === 'denied' || loan.status === 'cancelled') return null
  if (loan.returnedAt) return 'returned'
  if (loan.status === 'pending') return 'requests'
  // The member has asked to give it back and nobody has checked it in yet.
  // Ranked above the date checks: what an admin has to do about it is take
  // the hardware back, which is true whether or not it is also late.
  if (loan.returnRequestedAt) return 'returns'
  if (loan.returnDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const returnDate = new Date(`${loan.returnDate}T00:00:00`)
    if (returnDate < today) return 'overdue'
  }
  return 'active'
}

// Every equipment item ever requested, across all members — the admin
// "Hardware loans" list, the dashboard counts and the check-out/return scan
// matching. Same zipped-plain-queries approach as fetchLoanRequestItems,
// plus equipment_units (for the serial shown under the item name) and
// profiles (for the requesting member's name).
//
// All five tables are read whole and in parallel rather than each query
// filtering by the ids the previous one returned: admins can read every row
// of all five per their RLS policies, so the chained `.in(...)` filters only
// narrowed what was already allowed, at the cost of five sequential round
// trips. None of these tables is large at club scale.
//
// Always fetched fresh — the check-out and return screens decide from it,
// and a copy even a minute old can predate a request another browser just
// submitted — but remembered, so the dashboard and the loans list can paint
// the last copy on their first render (peekAllLoanRequestItems) while this
// runs. Each caller gets its own copy of the array, so one screen sorting or
// filtering it in place can't disturb another's.
//
// `fresh: true` for the check-out and return screens, which decide from it;
// the dashboard and loans list reuse a copy from the last few seconds, so
// moving between screens doesn't re-read five tables each time.
export async function fetchAllLoanRequestItems(
  { fresh = false }: { fresh?: boolean } = {},
): Promise<AdminLoanRequestItemSummary[]> {
  return [...(await refresh(CACHE_KEYS.adminLoans, loadAllLoanRequestItems, fresh ? 0 : DISPLAY_REUSE_MS))]
}

/** Every loan item as last loaded, synchronously, or null. Display only. */
export function peekAllLoanRequestItems(): AdminLoanRequestItemSummary[] | null {
  const items = peekValue<AdminLoanRequestItemSummary[]>(CACHE_KEYS.adminLoans)
  return items ? [...items] : null
}

async function loadAllLoanRequestItems(): Promise<AdminLoanRequestItemSummary[]> {
  const [requestsResult, itemsResult, equipmentResult, unitsResult, profilesResult] = await Promise.all([
    supabase.from('loan_requests').select('id, user_id, status, requested_at, cancelled_at'),
    supabase
      .from('loan_request_items')
      .select('id, loan_request_id, equipment_id, equipment_unit_id, return_date, returned_at, return_requested_at'),
    supabase.from('equipment').select('id, name, image_url'),
    supabase.from('equipment_units').select('id, serial_number'),
    supabase.from('profiles').select('id, first_name, last_name'),
  ])

  for (const result of [requestsResult, itemsResult, equipmentResult, unitsResult, profilesResult]) {
    if (result.error) throw result.error
  }

  const requests = requestsResult.data ?? []
  const items = itemsResult.data ?? []

  const requestById = new Map(requests.map((request) => [request.id, request]))
  const equipmentById = new Map((equipmentResult.data ?? []).map((equipment) => [equipment.id, equipment]))
  const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit]))
  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]))

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
        returnRequestedAt: item.return_requested_at,
        returnedAt: item.returned_at,
        cancelledAt: request.cancelled_at,
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

  // 'returns' counts as out too — a member asking for it back doesn't put it
  // in anyone else's hands to check out until it's actually handed in.
  const out = forUnit.find((loan) => {
    const bucket = bucketForLoanItem(loan)
    return bucket === 'active' || bucket === 'overdue' || bucket === 'returns'
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
  // 'returns' counts as out too — a member asking for it back doesn't change
  // whose hands it's actually in until this scan records it.
  const out = forUnit.find((loan) => {
    const bucket = bucketForLoanItem(loan)
    return bucket === 'active' || bucket === 'overdue' || bucket === 'returns'
  })
  if (out) return { outcome: 'ready', serial, loan: out }

  const requested = forUnit.find((loan) => bucketForLoanItem(loan) === 'requests')
  if (requested) return { outcome: 'not_handed_over', serial, loan: requested }

  return { outcome: 'no_match', serial, loan: null }
}
