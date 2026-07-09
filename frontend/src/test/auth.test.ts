import { isUWEmail } from '../lib/auth'

describe('isUWEmail', () => {
  it('accepts standard @uw.edu addresses', () => {
    expect(isUWEmail('student@uw.edu')).toBe(true)
    expect(isUWEmail('jsmith123@uw.edu')).toBe(true)
  })

  it('rejects personal Google accounts', () => {
    expect(isUWEmail('user@gmail.com')).toBe(false)
  })

  it('rejects @washington.edu — not the same domain', () => {
    expect(isUWEmail('user@washington.edu')).toBe(false)
  })

  it('rejects addresses that contain but do not end with @uw.edu', () => {
    expect(isUWEmail('user@uw.edu.evil.com')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isUWEmail('')).toBe(false)
  })

  it('rejects a bare username with no domain', () => {
    expect(isUWEmail('studentname')).toBe(false)
  })
})
