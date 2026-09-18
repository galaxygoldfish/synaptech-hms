import { generateSerialNumbers, normalizeSerialNumber, SERIAL_PREFIX } from '../lib/serialNumber'

// Shared by the scan-based checkout, the return flow, the hand-off
// verification and the inventory audit. All four look a unit up by the result,
// so a change here changes whether barcodes match in every one of them.
describe('normalizeSerialNumber', () => {
  it('adds the prefix a bare barcode reading leaves off', () => {
    expect(normalizeSerialNumber('hjxpp41t5')).toBe('SYN-HJXPP41T5')
  })

  it('leaves an already-prefixed serial alone', () => {
    expect(normalizeSerialNumber('SYN-HJXPP41T5')).toBe('SYN-HJXPP41T5')
  })

  it('trims and upper-cases what a reader or a typist hands it', () => {
    expect(normalizeSerialNumber('  syn-hjxpp41t5 ')).toBe('SYN-HJXPP41T5')
  })

  // Empty stays empty rather than becoming a bare "SYN-", which would match
  // nothing but read like a real serial in an error message.
  it('returns nothing for nothing', () => {
    expect(normalizeSerialNumber('')).toBe('')
    expect(normalizeSerialNumber('   ')).toBe('')
  })
})

describe('generateSerialNumbers', () => {
  it('generates the asked-for number of prefixed, unique serials', () => {
    const serials = generateSerialNumbers(25)

    expect(new Set(serials).size).toBe(25)
    for (const serial of serials) {
      expect(serial).toMatch(/^SYN-[A-Z0-9]{9}$/)
      expect(normalizeSerialNumber(serial)).toBe(serial)
    }
  })

  it('agrees with the prefix the lookups normalise to', () => {
    expect(generateSerialNumbers(1)[0].startsWith(SERIAL_PREFIX)).toBe(true)
  })
})
