import {
  approveExtension,
  bucketForLoanItem,
  denyExtension,
  hasPendingExtension,
  LoanConflictError,
} from '../lib/loanRequests'
import { stampApprovedAgreement } from '../lib/loanAgreementApproval'

// Same stand-in for the PostgREST builder as loanConflicts.test.ts: every
// chained call is recorded, and awaiting the chain asks `respond`.
interface Query {
  table: string
  op: 'select' | 'update'
  filters: [string, string, unknown][]
  values?: Record<string, unknown>
}

type Respond = (query: Query) => { data: unknown; error: unknown }
let respond: Respond
const queries: Query[] = []

function builder(table: string) {
  const query: Query = { table, op: 'select', filters: [] }
  const chain = {
    select: () => chain,
    update: (values: Record<string, unknown>) => {
      query.op = 'update'
      query.values = values
      return chain
    },
    eq: (column: string, value: unknown) => {
      query.filters.push(['eq', column, value])
      return chain
    },
    is: (column: string, value: unknown) => {
      query.filters.push(['is', column, value])
      return chain
    },
    single: () => chain,
    // oxlint-disable-next-line unicorn/no-thenable
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      queries.push(query)
      return Promise.resolve(respond(query)).then(resolve, reject)
    },
  }
  return chain
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://signed' }, error: null }),
      }),
    },
  },
}))

vi.mock('../lib/loanAgreementApproval', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanAgreementApproval')>('../lib/loanAgreementApproval')
  return { ...actual, stampApprovedAgreement: vi.fn() }
})

const EXTENSION_PATH = 'u1/r1/e1-extension-1700000000000.pdf'
const STAMPED_PATH = 'u1/r1/e1-extension-1700000000000-approved.pdf'

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    extension_status: 'pending',
    extension_agreement_path: EXTENSION_PATH,
    extension_return_date: '2027-03-10',
    returned_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  queries.length = 0
  vi.mocked(stampApprovedAgreement).mockReset()
  vi.mocked(stampApprovedAgreement).mockResolvedValue(STAMPED_PATH)
})

describe('hasPendingExtension', () => {
  it('is true for a pending extension on hardware still out', () => {
    expect(hasPendingExtension({ extensionStatus: 'pending', returnedAt: null })).toBe(true)
  })

  it('is false once the hardware is back, whatever the extension says', () => {
    expect(hasPendingExtension({ extensionStatus: 'pending', returnedAt: '2026-12-10T10:00:00Z' })).toBe(false)
  })

  it('is false when nothing is waiting', () => {
    expect(hasPendingExtension({ extensionStatus: 'approved', returnedAt: null })).toBe(false)
    expect(hasPendingExtension({ extensionStatus: null, returnedAt: null })).toBe(false)
  })
})

describe('bucketForLoanItem with a pending extension', () => {
  it('leaves an in-date loan active and a late one overdue', () => {
    const base = { status: 'approved' as const, returnedAt: null, returnRequestedAt: null }
    expect(bucketForLoanItem({ ...base, returnDate: '2099-01-01' })).toBe('active')
    expect(bucketForLoanItem({ ...base, returnDate: '2000-01-01' })).toBe('overdue')
  })
})

describe('approveExtension', () => {
  it('stamps the extension agreement and points the item at it', async () => {
    respond = (query) =>
      query.op === 'select' ? { data: pendingRow(), error: null } : { data: [{ id: 'i1' }], error: null }

    await approveExtension({ itemId: 'i1', adminName: 'Ada Admin', expectedReturnDate: '2027-03-10' })

    expect(stampApprovedAgreement).toHaveBeenCalledWith(
      expect.objectContaining({ agreementPath: EXTENSION_PATH, managerName: 'Ada Admin' }),
    )
    const update = queries.find((query) => query.op === 'update')!
    expect(update.values).toEqual({ extension_status: 'approved', signed_agreement_path: STAMPED_PATH })
    expect(update.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'i1'],
        ['eq', 'extension_status', 'pending'],
        ['eq', 'extension_return_date', '2027-03-10'],
        ['is', 'returned_at', null],
      ]),
    )
  })

  it('tells the admin when another admin got there first', async () => {
    respond = (query) => (query.op === 'select' ? { data: pendingRow(), error: null } : { data: [], error: null })

    await expect(
      approveExtension({ itemId: 'i1', adminName: 'Ada Admin', expectedReturnDate: '2027-03-10' }),
    ).rejects.toBeInstanceOf(LoanConflictError)
  })

  it('does not stamp an extension that was already decided', async () => {
    respond = () => ({ data: pendingRow({ extension_status: 'approved' }), error: null })

    await expect(
      approveExtension({ itemId: 'i1', adminName: 'Ada Admin', expectedReturnDate: '2027-03-10' }),
    ).rejects.toBeInstanceOf(LoanConflictError)
    expect(stampApprovedAgreement).not.toHaveBeenCalled()
  })

  it('refuses when the requested date is not the one the admin saw', async () => {
    respond = () => ({ data: pendingRow({ extension_return_date: '2027-03-20' }), error: null })

    await expect(
      approveExtension({ itemId: 'i1', adminName: 'Ada Admin', expectedReturnDate: '2027-03-10' }),
    ).rejects.toBeInstanceOf(LoanConflictError)
    expect(stampApprovedAgreement).not.toHaveBeenCalled()
  })
})

describe('denyExtension', () => {
  it('records the reason on a pending extension', async () => {
    respond = () => ({ data: [{ id: 'i1' }], error: null })

    await denyExtension('i1', 'No group')

    const update = queries.find((query) => query.op === 'update')!
    expect(update.values).toEqual({ extension_status: 'denied', extension_review_note: 'No group' })
    expect(update.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'i1'],
        ['eq', 'extension_status', 'pending'],
      ]),
    )
  })

  it('tells the admin when it was already decided', async () => {
    respond = () => ({ data: [], error: null })
    await expect(denyExtension('i1', 'No group')).rejects.toBeInstanceOf(LoanConflictError)
  })
})
