const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
/** Characters after the SYN- prefix. Exported so a field that stands in for
    a serial can be the right shape without hard-coding the number. */
export const SERIAL_SUFFIX_LENGTH = 9

function randomSuffix(): string {
  let result = ''
  for (let i = 0; i < SERIAL_SUFFIX_LENGTH; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)]
  }
  return result
}

// Generates `count` unique serial numbers of the form SYN-XXXXXXXXX
// (9 random uppercase letters/digits), guaranteed unique within the batch.
export function generateSerialNumbers(count: number): string[] {
  const serials = new Set<string>()
  while (serials.size < count) {
    serials.add(`SYN-${randomSuffix()}`)
  }
  return Array.from(serials)
}

export const SERIAL_PREFIX = 'SYN-'

/**
 * Turns whatever a barcode reader or a typed field produced into the form
 * serial numbers are stored in, so a label that reads "HJXPP41T5" matches a
 * unit stored as "SYN-HJXPP41T5".
 *
 * Every flow that looks a unit up by scan or by hand goes through this — the
 * scan-based checkout and return hooks, the hand-off verification, and the
 * inventory audit — because a lookup that normalises differently from the
 * one next to it is a bug nobody sees until a barcode stops matching.
 */
export function normalizeSerialNumber(raw: string): string {
  const trimmed = raw.trim().toUpperCase()
  if (!trimmed) return ''
  return trimmed.startsWith(SERIAL_PREFIX) ? trimmed : `${SERIAL_PREFIX}${trimmed}`
}
