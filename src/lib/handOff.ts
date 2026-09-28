import { fetchEquipment } from './inventory'
import { fetchLoanRequestItemDetail, type AdminLoanRequestDetail } from './loanRequests'
import { fetchProfileById } from './members'
import { CACHE_KEYS } from './queryCache'
import type { Equipment } from '../types'
import type { Profile } from '../types/index'

/**
 * Everything the hand-off agreement screen (LoanAgreementSignOff) prints:
 * the loan, the borrower's full profile (student id, phone and address are
 * on the agreement) and the product (its replacement value is too).
 *
 * Its own module so the check-out screens can fetch it ahead of time — while
 * the admin is looking at the confirm card — and the agreement opens drawn.
 */
export interface HandOffData {
  detail: AdminLoanRequestDetail
  member: Profile
  equipment: Equipment
}

export async function fetchHandOffData(itemId: string): Promise<HandOffData> {
  const detail = await fetchLoanRequestItemDetail(itemId)
  const [member, equipment] = await Promise.all([fetchProfileById(detail.memberId), fetchEquipment(detail.equipmentId)])
  return { detail, member, equipment }
}

export function handOffKey(itemId: string): string {
  return `${CACHE_KEYS.handOff}${itemId}`
}
