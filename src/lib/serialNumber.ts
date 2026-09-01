const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const SUFFIX_LENGTH = 9

function randomSuffix(): string {
  let result = ''
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
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
