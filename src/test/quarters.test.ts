import { describe, expect, it } from 'vitest'
import { extensionWindow, getQuarterEndDate, nextQuarterEndDate } from '../lib/quarters'

describe('nextQuarterEndDate', () => {
  it('chains each quarter end to the next, rolling the year after autumn', () => {
    expect(nextQuarterEndDate('2026-12-15')).toBe('2027-03-20')
    expect(nextQuarterEndDate('2027-03-20')).toBe('2027-06-10')
    expect(nextQuarterEndDate('2027-06-10')).toBe('2027-08-20')
    expect(nextQuarterEndDate('2027-08-20')).toBe('2027-12-15')
  })
})

describe('getQuarterEndDate', () => {
  it('keeps the checkout cap unchanged', () => {
    expect(getQuarterEndDate(new Date(2026, 10, 22))).toBe('2026-12-15')
    expect(getQuarterEndDate(new Date(2027, 5, 12))).toBeNull()
  })
})

describe('extensionWindow', () => {
  it('opens 14 days before the quarter end and offers the next quarter end', () => {
    expect(extensionWindow(new Date(2026, 11, 1))).toEqual({
      opensOn: '2026-12-01',
      closesOn: '2026-12-15',
      maxDate: '2027-03-20',
      isOpen: true,
    })
  })

  it('is open on the quarter end itself', () => {
    expect(extensionWindow(new Date(2026, 11, 15))?.isOpen).toBe(true)
  })

  it('is not open the day before it opens', () => {
    const window = extensionWindow(new Date(2026, 10, 30))
    expect(window?.isOpen).toBe(false)
    expect(window?.opensOn).toBe('2026-12-01')
  })

  it('handles the winter window edges', () => {
    expect(extensionWindow(new Date(2027, 2, 6))?.isOpen).toBe(true)
    expect(extensionWindow(new Date(2027, 2, 5))?.isOpen).toBe(false)
  })

  it('has no window in the gaps between quarters', () => {
    expect(extensionWindow(new Date(2027, 5, 12))).toBeNull()
    expect(extensionWindow(new Date(2027, 7, 25))).toBeNull()
  })

  it('offers autumn after summer', () => {
    expect(extensionWindow(new Date(2027, 7, 20))?.maxDate).toBe('2027-12-15')
  })
})
