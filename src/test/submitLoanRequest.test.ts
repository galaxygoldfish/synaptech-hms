import { supabase } from '../lib/supabase'
import { fetchAvailableEquipmentUnit } from '../lib/inventory'
import { submitLoanRequest, UnitUnavailableError, type SubmitLoanRequestInput } from '../lib/loanRequests'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock('../lib/inventory', () => ({ fetchAvailableEquipmentUnit: vi.fn() }))

const insertedItems = vi.fn()
const deletedRequests = vi.fn()
let itemsInsertResult: { error: unknown } = { error: null }

beforeEach(() => {
  insertedItems.mockReset()
  deletedRequests.mockReset()
  itemsInsertResult = { error: null }
  vi.mocked(fetchAvailableEquipmentUnit).mockReset()

  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'loan_requests') {
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'req-1' }, error: null }) }) }),
        delete: () => ({
          eq: async (_column: string, id: string) => {
            deletedRequests(id)
            return { error: null }
          },
        }),
      }
    }
    if (table === 'loan_request_items') {
      return {
        insert: async (rows: unknown) => {
          insertedItems(rows)
          return itemsInsertResult
        },
      }
    }
    return { insert: async () => ({ error: null }) }
  }) as never)
})

function input(equipmentUnitId?: string | null): SubmitLoanRequestInput {
  return {
    userId: 'megan',
    availability: [],
    items: [
      {
        equipmentId: 'eq-muse',
        isHardware: true,
        role: 'primary',
        returnDate: '2026-10-01',
        signedAgreementFile: null,
        signatureName: 'Megan Pereira',
        signatureDate: '2026-09-18',
        equipmentUnitId,
      },
    ],
  }
}

describe('submitLoanRequest — one unit, one borrower', () => {
  it('claims the unit the agreement was signed for', async () => {
    await submitLoanRequest(input('unit-2'))

    expect(fetchAvailableEquipmentUnit).not.toHaveBeenCalled()
    expect(insertedItems).toHaveBeenCalledWith([expect.objectContaining({ equipment_unit_id: 'unit-2' })])
  })

  it('picks a free unit when none was carried through', async () => {
    vi.mocked(fetchAvailableEquipmentUnit).mockResolvedValue({
      id: 'unit-2',
      equipment_id: 'eq-muse',
      serial_number: 'SYN-BBB222',
      created_at: '2026-01-01T00:00:00Z',
    })

    await submitLoanRequest(input())

    expect(insertedItems).toHaveBeenCalledWith([expect.objectContaining({ equipment_unit_id: 'unit-2' })])
  })

  it('refuses the request when every unit is already spoken for', async () => {
    vi.mocked(fetchAvailableEquipmentUnit).mockResolvedValue(null)

    await expect(submitLoanRequest(input())).rejects.toBeInstanceOf(UnitUnavailableError)

    expect(insertedItems).not.toHaveBeenCalled()
    expect(deletedRequests).toHaveBeenCalledWith('req-1')
  })

  // Two members can pass the availability check at the same moment; the
  // database's guard trigger lets only one of them keep the serial.
  it('reports a unit someone else claimed first, and leaves no half-made request', async () => {
    itemsInsertResult = { error: { message: 'unit_unavailable', code: 'P0001' } }

    await expect(submitLoanRequest(input('unit-1'))).rejects.toBeInstanceOf(UnitUnavailableError)

    expect(deletedRequests).toHaveBeenCalledWith('req-1')
  })

  it('does not disguise other database errors as an availability problem', async () => {
    itemsInsertResult = { error: { message: 'permission denied', code: '42501' } }

    await expect(submitLoanRequest(input('unit-1'))).rejects.toMatchObject({ message: 'permission denied' })
  })
})
