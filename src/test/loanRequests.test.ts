import { bucketForLoanItem } from '../lib/loanRequests'

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
