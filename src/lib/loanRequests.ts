import { supabase } from './supabase'
import { fetchAvailableEquipmentUnit } from './inventory'
import type { LoanRequest, LoanRequestItemRole, LoanRequestStatus } from '../types'

const LOAN_AGREEMENTS_BUCKET = 'loan-agreements'

export interface SubmitLoanRequestItemInput {
  equipmentId: string
  isHardware: boolean
  role: LoanRequestItemRole
  returnDate: string | null // ISO date; hardware only
  signedAgreementFile: File | null // hardware only
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

export interface AdminLoanRequestItemSummary {
  id: string
  equipmentId: string
  itemName: string
  imageUrl: string | null
  serialNumber: string | null
  status: LoanRequestStatus
  requestedAt: string
  returnDate: string | null
  memberName: string
}

export type LoanBucket = 'active' | 'overdue' | 'requests' | 'returns'

// Shared by the admin "Hardware loans" list and the dashboard stat cards so
// their counts can never drift apart. Denied requests never became a loan,
// so they're excluded entirely (null). There's no "returns" bucket
// populated yet — nothing in the app has a return-request flow — so it
// never matches here; the bucket exists for when that's built.
export function bucketForLoanItem(loan: Pick<AdminLoanRequestItemSummary, 'status' | 'returnDate'>): LoanBucket | null {
  if (loan.status === 'denied') return null
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
    .select('id, loan_request_id, equipment_id, equipment_unit_id, return_date')
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
        memberName: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown member',
      },
    ]
  })

  return summaries.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
}
