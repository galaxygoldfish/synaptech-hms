import {
  handOffLoanRequestItem,
  LoanConflictError,
  markLoanRequestItemReturned,
} from '../lib/loanRequests'
import { stampApprovedAgreement } from '../lib/loanAgreementApproval'

// A minimal stand-in for the PostgREST query builder: every chained call is
// recorded, and awaiting the chain asks `respond` for the result. Tests
// answer by table and operation, which is all these two functions branch on.
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
    in: (column: string, value: unknown) => {
      query.filters.push(['in', column, value])
      return chain
    },
    is: (column: string, value: unknown) => {
      query.filters.push(['is', column, value])
      return chain
    },
    single: () => chain,
    maybeSingle: () => chain,
    // Deliberately thenable: the real PostgREST builder is awaited directly.
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

const ORIGINAL = 'user-1/req-1/eq-1.pdf'
const STAMPED = 'user-1/req-1/eq-1-approved.pdf'

interface World {
  itemPath: string
  status: string
  reviewedBy?: string | null
  /** Rows the item compare-and-set matches — 0 when another admin won. */
  claimRows?: number
  /** Rows the request status update matches — 0 when it was cancelled mid-way. */
  approveRows?: number
}

function world(w: World): Respond {
  return (query) => {
    if (query.table === 'loan_request_items' && query.op === 'select') {
      return { data: { loan_request_id: 'req-1', signed_agreement_path: w.itemPath }, error: null }
    }
    if (query.table === 'loan_requests' && query.op === 'select') {
      return { data: { status: w.status, reviewed_by: w.reviewedBy ?? null }, error: null }
    }
    if (query.table === 'loan_request_items' && query.op === 'update') {
      return { data: Array.from({ length: w.claimRows ?? 1 }, () => ({ id: 'item-1' })), error: null }
    }
    if (query.table === 'loan_requests' && query.op === 'update') {
      return { data: Array.from({ length: w.approveRows ?? 1 }, () => ({ id: 'req-1' })), error: null }
    }
    if (query.table === 'profiles') {
      return { data: { first_name: 'Ada', last_name: 'Admin' }, error: null }
    }
    throw new Error(`unexpected query on ${query.table}`)
  }
}

const input = { itemId: 'item-1', adminId: 'admin-2', adminName: 'Bea Admin' }

function updatesTo(table: string) {
  return queries.filter((query) => query.table === table && query.op === 'update')
}

beforeEach(() => {
  queries.length = 0
  vi.mocked(stampApprovedAgreement).mockReset().mockResolvedValue(STAMPED)
})

describe('handOffLoanRequestItem', () => {
  it('stamps, claims the item and approves a pending request', async () => {
    respond = world({ itemPath: ORIGINAL, status: 'pending' })

    await handOffLoanRequestItem(input)

    expect(stampApprovedAgreement).toHaveBeenCalledTimes(1)
    // The claim only matches while the item still points at the unstamped copy.
    expect(updatesTo('loan_request_items')[0].filters).toContainEqual(['eq', 'signed_agreement_path', ORIGINAL])
    expect(updatesTo('loan_requests')[0].values).toMatchObject({ status: 'approved', reviewed_by: 'admin-2' })
  })

  // The case this guards: a second admin, working from a screen that still
  // showed the request as waiting, after a colleague has handed it over.
  it('refuses an item a colleague has already handed off, before writing anything', async () => {
    respond = world({ itemPath: STAMPED, status: 'approved', reviewedBy: 'admin-1' })

    const attempt = handOffLoanRequestItem(input)

    await expect(attempt).rejects.toBeInstanceOf(LoanConflictError)
    await expect(attempt).rejects.toThrow('already been checked out by Ada Admin')
    expect(stampApprovedAgreement).not.toHaveBeenCalled()
    expect(updatesTo('loan_request_items')).toHaveLength(0)
    expect(updatesTo('loan_requests')).toHaveLength(0)
  })

  it('refuses a request the member cancelled', async () => {
    respond = world({ itemPath: ORIGINAL, status: 'cancelled' })

    await expect(handOffLoanRequestItem(input)).rejects.toThrow('member cancelled')
    expect(stampApprovedAgreement).not.toHaveBeenCalled()
  })

  // Two admins confirming within the same second: both pass the up-front
  // check, but only one compare-and-set can match.
  it('reports the loser of a simultaneous hand-off and leaves the status alone', async () => {
    respond = world({ itemPath: ORIGINAL, status: 'pending', reviewedBy: 'admin-1', claimRows: 0 })

    await expect(handOffLoanRequestItem(input)).rejects.toThrow('already been checked out by Ada Admin')
    expect(updatesTo('loan_requests')).toHaveLength(0)
  })

  // A bundled request is approved by its first item's hand-off, so a later
  // item is handed off against an 'approved' request. That must still work.
  it('hands off a later item of a request that is already approved', async () => {
    respond = world({ itemPath: ORIGINAL, status: 'approved' })

    await handOffLoanRequestItem(input)

    expect(stampApprovedAgreement).toHaveBeenCalledTimes(1)
    expect(updatesTo('loan_requests')).toHaveLength(1)
  })

  it('finishes a hand-off that was stamped but failed before approval, without re-stamping', async () => {
    respond = world({ itemPath: STAMPED, status: 'pending' })

    await handOffLoanRequestItem(input)

    expect(stampApprovedAgreement).not.toHaveBeenCalled()
    expect(updatesTo('loan_requests')[0].values).toMatchObject({ status: 'approved' })
  })

  it('reports a cancellation that lands while the certificate is being made', async () => {
    respond = world({ itemPath: ORIGINAL, status: 'pending', approveRows: 0 })

    await expect(handOffLoanRequestItem(input)).rejects.toThrow('cancelled this request while')
  })
})

describe('markLoanRequestItemReturned', () => {
  it('records a return', async () => {
    respond = (query) =>
      query.op === 'update' ? { data: [{ id: 'item-1' }], error: null } : { data: null, error: null }

    await expect(markLoanRequestItemReturned('item-1', 'admin-2')).resolves.toBeUndefined()
  })

  // Previously this "succeeded" with nothing written, and the second admin
  // saw a confirmation screen for a return that was never recorded.
  it('tells a second admin the hardware was already checked in, and by whom', async () => {
    respond = (query) => {
      if (query.op === 'update') return { data: [], error: null }
      if (query.table === 'loan_request_items') return { data: { returned_by: 'admin-1' }, error: null }
      return { data: { first_name: 'Ada', last_name: 'Admin' }, error: null }
    }

    await expect(markLoanRequestItemReturned('item-1', 'admin-2')).rejects.toThrow(
      'already checked in by Ada Admin',
    )
  })
})
