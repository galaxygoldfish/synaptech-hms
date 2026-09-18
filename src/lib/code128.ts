/**
 * Code 128 encoding for the printed hardware labels.
 *
 * The labels draw their barcode with the "Libre Barcode 128" webfont, which
 * turns characters into bar patterns and nothing more. A Code 128 symbol is
 * not just its payload: it needs a start character, a modulo-103 checksum
 * and a stop character, and the font computes none of them. Passing a raw
 * serial straight to it produces something that looks like a barcode and
 * that no scanner can read — which is exactly what the labels did before
 * this module existed.
 *
 * Code set B is used throughout: it covers ASCII 32-126, and serials are
 * "SYN-" plus uppercase letters and digits (see serialNumber.ts).
 */

const START_B = 104
const STOP = 106

// Values 0-94 are the printable ASCII range offset by 32; 95-106 are the
// control values, which the font maps to the 204+ character range.
function toGlyph(value: number): string {
  return String.fromCharCode(value < 95 ? value + 32 : value + 100)
}

/** True for characters code set B can represent. */
function isEncodable(character: string): boolean {
  const code = character.charCodeAt(0)
  return code >= 32 && code <= 126
}

/**
 * Wraps `value` in the framing a Code 128 reader needs, returning the string
 * to render in the barcode font. The human-readable line on the label should
 * keep showing the original value, not this.
 *
 * Throws on characters outside code set B rather than silently emitting a
 * barcode that scans as something other than what's printed beneath it.
 */
export function encodeCode128B(value: string): string {
  if (!value) throw new Error('Cannot encode an empty value as Code 128.')

  const unencodable = [...value].filter((character) => !isEncodable(character))
  if (unencodable.length > 0) {
    throw new Error(`Cannot encode ${JSON.stringify(unencodable.join(''))} in Code 128 set B.`)
  }

  // The checksum is the start value plus each character's value weighted by
  // its 1-based position, modulo 103.
  let checksum = START_B
  for (let index = 0; index < value.length; index += 1) {
    checksum += (value.charCodeAt(index) - 32) * (index + 1)
  }

  return toGlyph(START_B) + value + toGlyph(checksum % 103) + toGlyph(STOP)
}
