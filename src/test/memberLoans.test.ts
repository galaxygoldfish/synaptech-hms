import { isOutWithMember, memberLoanState, type MemberLoanItem } from '../lib/memberLoans'

/** "Today" for every case here, so nothing depends on when the suite runs. */
const NOW = new Date('2026-09-18T12:00:00Z')

function item(overrides: Partial<MemberLoanItem> = {}): MemberLoanItem {
  return {
    id: 'item-1',
    loanRequestId: 'req-1',
    equipmentId: 'eq-1',
    itemName: 'Muse 2',
    itemDescription: 'A headband-style forehead EEG recording device',
    imageUrl: null,
    documentationUrl: null,
    isConsumable: false,
    itemRole: 'primary',
    serialNumber: 'SYN-HJXPP41T5',
    requestStatus: 'approved',
    requestedAt: '2026-06-23T17:30:00Z',
    reviewedAt: '2026-06-23T18:00:00Z',
    returnDate: '2026-12-01',
    returnRequestedAt: null,
    returnedAt: null,
    signedAgreementPath: 'member/req-1/eq-1.pdf',
    ...overrides,
  }
}

describe('memberLoanState', () => {
  it('calls a pending request a checkout request', () => {
    expect(memberLoanState(item({ requestStatus: 'pending' }), NOW)).toBe('checkout_requested')
  })

  it('tells the member cancelling it apart from an admin refusing it', () => {
    expect(memberLoanState(item({ requestStatus: 'cancelled' }), NOW)).toBe('cancelled')
    expect(memberLoanState(item({ requestStatus: 'denied' }), NOW)).toBe('denied')
  })

  it('calls an approved loan with a distant return date active', () => {
    expect(memberLoanState(item({ returnDate: '2026-12-01' }), NOW)).toBe('active')
  })

  // The whole point of the state: a week's warning before it is a problem.
  it('warns a week ahead of the return date', () => {
    expect(memberLoanState(item({ returnDate: '2026-09-25' }), NOW)).toBe('return_soon')
  })

  it('is still active the day before that window opens', () => {
    expect(memberLoanState(item({ returnDate: '2026-09-26' }), NOW)).toBe('active')
  })

  it('warns on the return date itself rather than calling it late', () => {
    expect(memberLoanState(item({ returnDate: '2026-09-18' }), NOW)).toBe('return_soon')
  })

  it('calls it overdue the day after it was due', () => {
    expect(memberLoanState(item({ returnDate: '2026-09-17' }), NOW)).toBe('overdue')
  })

  it('reports a raised return request over the date', () => {
    const state = memberLoanState(
      item({ returnDate: '2026-09-17', returnRequestedAt: '2026-09-16T10:00:00Z' }),
      NOW,
    )
    expect(state).toBe('return_requested')
  })

  // Terminal, and ranked above everything: hardware handed back three weeks
  // late is returned, not overdue — nothing about it is outstanding.
  it('reports a late return as returned rather than overdue', () => {
    const state = memberLoanState(
      item({ returnDate: '2026-08-01', returnedAt: '2026-09-15T10:00:00Z' }),
      NOW,
    )
    expect(state).toBe('returned')
  })

  it('reports a returned loan as returned even if a return was requested first', () => {
    const state = memberLoanState(
      item({ returnRequestedAt: '2026-09-10T10:00:00Z', returnedAt: '2026-09-15T10:00:00Z' }),
      NOW,
    )
    expect(state).toBe('returned')
  })

  // Consumables are kept, so there is no date for one to be late against —
  // without this rule a consumable would sit at "active" by accident rather
  // than on purpose, and any later change to the date logic could break it.
  it('leaves a consumable active, having nothing to be due', () => {
    expect(memberLoanState(item({ isConsumable: true, returnDate: null }), NOW)).toBe('active')
  })

  // A request that hasn't been handed over cannot be late, whatever date the
  // member picked when they submitted it.
  it('never calls an uncollected request overdue', () => {
    const state = memberLoanState(item({ requestStatus: 'pending', returnDate: '2020-01-01' }), NOW)
    expect(state).toBe('checkout_requested')
  })
})

describe('isOutWithMember', () => {
  it('is true for every state where the member is holding the hardware', () => {
    expect(isOutWithMember('active')).toBe(true)
    expect(isOutWithMember('return_soon')).toBe(true)
    expect(isOutWithMember('return_requested')).toBe(true)
    expect(isOutWithMember('overdue')).toBe(true)
  })

  it('is false before a loan starts and after it ends', () => {
    expect(isOutWithMember('checkout_requested')).toBe(false)
    expect(isOutWithMember('cancelled')).toBe(false)
    expect(isOutWithMember('denied')).toBe(false)
    expect(isOutWithMember('returned')).toBe(false)
  })
})
