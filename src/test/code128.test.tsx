import { render, screen } from '@testing-library/react'
import { encodeCode128B } from '../lib/code128'
import { SerialBarcodeLabel } from '../components/admin-dashboard/labels/SerialBarcodeLabel'

// Character values, for readability in the expectations below.
const START_B = 'Ì' // value 104
const STOP = 'Î' // value 106

describe('encodeCode128B', () => {
  // Worked by hand: start B is 104, "A" contributes (65 - 32) * 1 = 33, so
  // the checksum is (104 + 33) % 103 = 34, which is the glyph for 34 + 32 =
  // 66, "B".
  it('frames a value with the start character, checksum and stop character', () => {
    expect(encodeCode128B('A')).toBe(`${START_B}AB${STOP}`)
  })

  // This exact string was rendered in the label font and decoded back to
  // "SYN-HJXPP41T5" by a real Code 128 reader (ZXing). Pinning it here means
  // a change to the checksum maths can't quietly stop labels scanning.
  it('produces the framing a ZXing reader decodes for a real serial', () => {
    expect(encodeCode128B('SYN-HJXPP41T5')).toBe(`${START_B}SYN-HJXPP41T5$${STOP}`)
  })

  it('weights each character by its position', () => {
    // Same characters, different order: a checksum that ignored position
    // would give these two the same check character.
    expect(encodeCode128B('AB')).not.toBe(encodeCode128B('BA'))
  })

  it('keeps the payload intact between the framing characters', () => {
    const encoded = encodeCode128B('SYN-ABC123XYZ')
    expect(encoded.slice(1, -2)).toBe('SYN-ABC123XYZ')
    expect(encoded.startsWith(START_B)).toBe(true)
    expect(encoded.endsWith(STOP)).toBe(true)
  })

  // Better to fail loudly than to print a barcode that scans as something
  // other than the serial written underneath it.
  it('refuses characters code set B cannot represent', () => {
    expect(() => encodeCode128B('SYN-ÉTÉ')).toThrow(/Code 128 set B/)
    expect(() => encodeCode128B('')).toThrow()
  })
})

describe('SerialBarcodeLabel', () => {
  it('prints the framed value as the barcode and the plain serial beneath it', () => {
    render(<SerialBarcodeLabel serial="SYN-HJXPP41T5" />)

    expect(screen.getByText(`${START_B}SYN-HJXPP41T5$${STOP}`)).toBeInTheDocument()
    expect(screen.getByText('SYN-HJXPP41T5')).toBeInTheDocument()
  })
})
