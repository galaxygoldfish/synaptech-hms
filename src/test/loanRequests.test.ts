import {
  bucketForLoanItem,
  matchCheckoutSerial,
  type AdminLoanRequestItemSummary,
} from '../lib/loanRequests'

function loan(overrides: Partial<Parameters<typeof bucketForLoanItem>[0]> = {}) {
  return { status: 'approved' as const, returnDate: null, returnedAt: null, ...overrides }
}

describe('bucketForLoanItem', () => {
  it('treats a pending request as a checkout request, not a loan', () => {
    expect(bucketForLoanItem(loan({ status: 'pending' }))).toBe('requests')
  })

  it('excludes denied requests entirely — they never became a loan', () => {
    expect(bucketForLoanItem(loan({ status: 'denied' }))).toBeNull()
  })

  it('marks an approved loan past its return date as overdue', () => {
    expect(bucketForLoanItem(loan({ returnDate: '2020-01-01' }))).toBe('overdue')
  })

  it('keeps an approved loan with a future return date active', () => {
    expect(bucketForLoanItem(loan({ returnDate: '2099-01-01' }))).toBe('active')
  })

  // The ordering that matters: hardware handed back three days late is
  // returned, not overdue. Nothing about it is outstanding any more, and
  // listing it under Overdue would send an admin chasing it.
  it('reports a late return as returned rather than overdue', () => {
    expect(bucketForLoanItem(loan({ returnDate: '2020-01-01', returnedAt: '2020-01-04T10:00:00Z' }))).toBe('returned')
  })

  it('reports an on-time return as returned', () => {
    expect(bucketForLoanItem(loan({ returnDate: '2099-01-01', returnedAt: '2026-09-14T10:00:00Z' }))).toBe('returned')
  })
})

function item(overrides: Partial<AdminLoanRequestItemSummary> = {}): AdminLoanRequestItemSummary {
  return {
    id: 'item-1',
    equipmentId: 'eq-1',
    itemName: 'Muse 2',
    imageUrl: null,
    serialNumber: 'SYN-HJXPP41T5',
    status: 'approved',
    requestedAt: '2026-09-14T17:30:00Z',
    returnDate: null,
    returnedAt: null,
    memberName: 'Bob Reyes',
    ...overrides,
  }
}

describe('matchCheckoutSerial', () => {
  it('finds the open request a serial belongs to', () => {
    const requested = item({ status: 'pending' })
    expect(matchCheckoutSerial([requested], 'SYN-HJXPP41T5')).toEqual({
      outcome: 'ready',
      serial: 'SYN-HJXPP41T5',
      loan: requested,
    })
  })

  it('refuses a unit that is already out, and names the loan holding it', () => {
    const out = item({ returnDate: '2099-01-01' })
    const match = matchCheckoutSerial([out], 'SYN-HJXPP41T5')
    expect(match.outcome).toBe('already_out')
    expect(match.loan).toBe(out)
  })

  // An overdue loan is still a loan: the unit is in someone else's hands
  // either way, so it cannot be handed to a second person.
  it('refuses an overdue unit the same way as an active one', () => {
    expect(matchCheckoutSerial([item({ returnDate: '2020-01-01' })], 'SYN-HJXPP41T5').outcome).toBe(
      'already_out',
    )
  })

  // The case that makes this a choice rather than a lookup: one unit lent,
  // returned, and requested again carries a row for each, and the request is
  // the one the admin is standing there to complete.
  it('prefers the open request over the unit\'s closed history', () => {
    const closed = item({ id: 'old', returnedAt: '2026-08-30T12:00:00Z' })
    const requested = item({ id: 'new', status: 'pending' })
    expect(matchCheckoutSerial([requested, closed], 'SYN-HJXPP41T5').loan).toBe(requested)
  })

  it('leaves a unit whose only loans are closed to the inventory lookup', () => {
    const match = matchCheckoutSerial([item({ returnedAt: '2026-08-30T12:00:00Z' })], 'SYN-HJXPP41T5')
    expect(match).toEqual({ outcome: 'no_match', serial: 'SYN-HJXPP41T5', loan: null })
  })

  // A denied request never became a loan, so it cannot be handed over.
  it('ignores a denied request', () => {
    expect(matchCheckoutSerial([item({ status: 'denied' })], 'SYN-HJXPP41T5').outcome).toBe('no_match')
  })

  it('ignores requests for other units, and items with no serial at all', () => {
    const elsewhere = item({ id: 'other', status: 'pending', serialNumber: 'SYN-QQ92KD10T' })
    const unassigned = item({ id: 'none', status: 'pending', serialNumber: null })
    expect(matchCheckoutSerial([elsewhere, unassigned], 'SYN-HJXPP41T5').outcome).toBe('no_match')
  })
})
