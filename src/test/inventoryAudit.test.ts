import { supabase } from '../lib/supabase'
import { fetchAuditableInventory } from '../lib/inventoryAudit'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

/** Every filter applied in a run, as `table.method(args…)` strings. */
let filters: string[] = []

/**
 * A stand-in for the PostgREST query builder: chainable, and resolving to
 * whatever rows the test registered for that table.
 *
 * The rows a test provides are already filtered, because filtering is
 * PostgREST's job rather than this function's. What the test does check is
 * that the filters were asked for at all — `status = approved` and
 * `returned_at is null` together ARE the definition of "checked out" that the
 * whole audit rests on, so their absence has to fail a test rather than
 * quietly turn every unit on loan into a missing one.
 */
function mockTables(rows: Record<string, unknown[]>) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const record = (method: string, args: unknown[]) => {
      filters.push(`${table}.${method}(${args.map(String).join(',')})`)
      return builder
    }
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (...args: unknown[]) => record('eq', args),
      in: (...args: unknown[]) => record('in', args),
      is: (...args: unknown[]) => record('is', args),
      not: (...args: unknown[]) => record('not', args),
      // Thenable on purpose: a PostgREST builder is awaited directly rather
      // than through a terminal call, so a stand-in for one has to be too.
      // eslint-disable-next-line unicorn/no-thenable
      then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null }),
    }
    return builder as unknown as ReturnType<typeof supabase.from>
  })
}

beforeEach(() => {
  filters = []
  vi.mocked(supabase.from).mockReset()
})

describe('fetchAuditableInventory', () => {
  it('expects a unit on the shelf unless an approved loan still holds it', async () => {
    mockTables({
      equipment_units: [
        { id: 'unit-1', equipment_id: 'eq-1', serial_number: 'SYN-AAA111AAA' },
        { id: 'unit-2', equipment_id: 'eq-1', serial_number: 'SYN-BBB222BBB' },
      ],
      equipment: [{ id: 'eq-1', name: 'Muse 2', image_url: 'muse.png' }],
      loan_requests: [{ id: 'req-1', user_id: 'member-1' }],
      loan_request_items: [{ loan_request_id: 'req-1', equipment_unit_id: 'unit-2' }],
      profiles: [{ id: 'member-1', first_name: 'Bob', last_name: 'Reyes' }],
    })

    const units = await fetchAuditableInventory()

    expect(units).toEqual([
      {
        unitId: 'unit-1',
        serialNumber: 'SYN-AAA111AAA',
        equipmentId: 'eq-1',
        equipmentName: 'Muse 2',
        imageUrl: 'muse.png',
        expectation: 'in_stock',
        memberName: null,
      },
      {
        unitId: 'unit-2',
        serialNumber: 'SYN-BBB222BBB',
        equipmentId: 'eq-1',
        equipmentName: 'Muse 2',
        imageUrl: 'muse.png',
        expectation: 'checked_out',
        memberName: 'Bob Reyes',
      },
    ])

    expect(filters).toContain('loan_requests.eq(status,approved)')
    expect(filters).toContain('loan_request_items.is(returned_at,null)')
  })

  it('expects everything on the shelf when nothing is out on loan', async () => {
    mockTables({
      equipment_units: [{ id: 'unit-1', equipment_id: 'eq-1', serial_number: 'SYN-AAA111AAA' }],
      equipment: [{ id: 'eq-1', name: 'Muse 2', image_url: null }],
      loan_requests: [],
    })

    const units = await fetchAuditableInventory()

    expect(units).toHaveLength(1)
    expect(units[0].expectation).toBe('in_stock')
  })

  it('returns nothing when there are no serialised units to scan', async () => {
    mockTables({ equipment_units: [] })

    await expect(fetchAuditableInventory()).resolves.toEqual([])
  })

  // An approved loan whose borrower's profile has gone still accounts for the
  // unit's absence — the audit just can't name who has it.
  it('still counts a unit as out when its borrower cannot be named', async () => {
    mockTables({
      equipment_units: [{ id: 'unit-1', equipment_id: 'eq-1', serial_number: 'SYN-AAA111AAA' }],
      equipment: [{ id: 'eq-1', name: 'Muse 2', image_url: null }],
      loan_requests: [{ id: 'req-1', user_id: 'member-gone' }],
      loan_request_items: [{ loan_request_id: 'req-1', equipment_unit_id: 'unit-1' }],
      profiles: [],
    })

    const [unit] = await fetchAuditableInventory()

    expect(unit.expectation).toBe('checked_out')
    expect(unit.memberName).toBeNull()
  })
})
