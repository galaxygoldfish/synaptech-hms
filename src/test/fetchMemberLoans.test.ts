import { fetchMemberLoans } from '../lib/memberLoans'
import { clearCache } from '../lib/queryCache'

// Canned rows per table. The member query now reads loan_request_items
// without an id filter (RLS scopes it), so these include a row belonging to
// someone else's request, which must not appear in the result.
const tables: Record<string, unknown[]> = {
  loan_requests: [{ id: 'req-1', status: 'approved', requested_at: '2026-09-01T00:00:00Z', reviewed_at: null }],
  loan_request_items: [
    {
      id: 'item-1',
      loan_request_id: 'req-1',
      equipment_id: 'eq-1',
      equipment_unit_id: 'unit-1',
      item_role: 'primary',
      return_date: '2099-01-01',
      returned_at: null,
      return_requested_at: null,
      signed_agreement_path: null,
    },
    {
      id: 'item-other',
      loan_request_id: 'req-someone-else',
      equipment_id: 'eq-1',
      equipment_unit_id: null,
      item_role: 'primary',
      return_date: null,
      returned_at: null,
      return_requested_at: null,
      signed_agreement_path: null,
    },
  ],
  equipment: [
    { id: 'eq-1', name: 'Muse 2', description: null, image_url: null, product_type: 'hardware', documentation_url: null },
  ],
  equipment_units: [{ id: 'unit-1', serial_number: 'SYN-HJXPP41T5' }],
}

const requestsByTable: Record<string, number> = {}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      requestsByTable[table] = (requestsByTable[table] ?? 0) + 1
      const result = Promise.resolve({ data: tables[table], error: null })
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        // Deliberately thenable: the real PostgREST builder is awaited directly.
        // oxlint-disable-next-line unicorn/no-thenable
        then: result.then.bind(result),
      }
      return chain
    },
  },
}))

beforeEach(() => {
  clearCache()
  for (const key of Object.keys(requestsByTable)) delete requestsByTable[key]
})

describe('fetchMemberLoans', () => {
  it("zips the member's own loans and ignores anyone else's rows", async () => {
    const groups = await fetchMemberLoans('member-1')

    expect(groups).toHaveLength(1)
    expect(groups[0].primary).toMatchObject({ id: 'item-1', itemName: 'Muse 2', serialNumber: 'SYN-HJXPP41T5' })
  })

  // Always fresh (Home decides its overdue block from it), but two callers
  // at once share one request.
  it('shares a request in flight, and fetches again once it has settled', async () => {
    await Promise.all([fetchMemberLoans('member-1'), fetchMemberLoans('member-1')])
    expect(requestsByTable.loan_requests).toBe(1)

    await fetchMemberLoans('member-1')
    expect(requestsByTable.loan_requests).toBe(2)
  })
})
