import { CACHE_KEYS } from './queryCache'

// Stash keys for the detail screens, shared by the row that prefetches one
// (usePrefetchNavigate) and the screen that reads it (readStash). Each sits
// under its data's cache prefix, so a write that invalidates the data also
// drops any stash of it.

export function loanDetailKey(itemId: string): string {
  return `${CACHE_KEYS.loanDetail}${itemId}`
}

export function memberDetailKey(profileId: string): string {
  return `${CACHE_KEYS.memberDetail}${profileId}`
}

export function auditReportKey(auditId: string): string {
  return `${CACHE_KEYS.inventoryAuditReport}${auditId}`
}

export function memberLoanItemKey(itemId: string): string {
  return `${CACHE_KEYS.memberLoanItem}${itemId}`
}
