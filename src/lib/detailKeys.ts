import { CACHE_KEYS } from './queryCache'

// Every stash key in one place — shared by the row that prefetches a screen
// (usePrefetchNavigate) and the screen that reads it (readStash). Each sits
// under its data's cache prefix, so a write that invalidates the data also
// drops any stash of it.

export function loanDetailKey(itemId: string): string {
  return `${CACHE_KEYS.loanDetail}${itemId}`
}

export function handOffKey(itemId: string): string {
  return `${CACHE_KEYS.handOff}${itemId}`
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

export function manageItemKey(equipmentId: string): string {
  return `${CACHE_KEYS.manageItem}${equipmentId}`
}

export function manageItemUnitsKey(equipmentId: string): string {
  return `${CACHE_KEYS.manageItemUnits}${equipmentId}`
}

export function labelsProductKey(equipmentId: string): string {
  return `${CACHE_KEYS.labelsProduct}${equipmentId}`
}

export function templateEditorKey(templateKey: string): string {
  return `${CACHE_KEYS.emailTemplate}${templateKey}`
}

export function checkoutStartKey(equipmentId: string): string {
  return `${CACHE_KEYS.checkoutStart}${equipmentId}`
}
