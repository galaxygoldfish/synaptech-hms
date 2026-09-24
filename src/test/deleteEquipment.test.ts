import { supabase } from '../lib/supabase'
import { deleteEquipment } from '../lib/inventory'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let deleteResult: { error: unknown } = { error: null }
let archiveResult: { error: unknown } = { error: null }
const archivedIds = vi.fn()

beforeEach(() => {
  deleteResult = { error: null }
  archiveResult = { error: null }
  archivedIds.mockReset()

  vi.mocked(supabase.from).mockImplementation(
    (() => ({
      delete: () => ({ eq: async () => deleteResult }),
      update: (payload: { archived_at: string }) => ({
        eq: async (_column: string, id: string) => {
          archivedIds(id, payload)
          return archiveResult
        },
      }),
    })) as never,
  )
})

describe('deleteEquipment', () => {
  it('hard-deletes a product with no loan history', async () => {
    await expect(deleteEquipment('eq-muse')).resolves.toBeUndefined()
    expect(archivedIds).not.toHaveBeenCalled()
  })

  // loan_request_items.equipment_id has no ON DELETE behavior (see
  // 20260817030000_loan_requests.sql), so Postgres blocks the delete with a
  // foreign-key violation for any product that's ever been on a loan
  // request — archive it instead so it drops out of every catalog listing
  // while loan history can still resolve its name.
  it('archives instead of hard-deleting when loan history blocks the delete', async () => {
    deleteResult = {
      error: {
        message: 'update or delete on table "equipment" violates foreign key constraint',
        code: '23503',
      },
    }

    await expect(deleteEquipment('eq-muse')).resolves.toBeUndefined()
    expect(archivedIds).toHaveBeenCalledWith('eq-muse', expect.objectContaining({ archived_at: expect.any(String) }))
  })

  it('surfaces an unrelated database error without falling back to archive', async () => {
    deleteResult = { error: { message: 'network error', code: '500' } }

    await expect(deleteEquipment('eq-muse')).rejects.toEqual(deleteResult.error)
    expect(archivedIds).not.toHaveBeenCalled()
  })

  it('surfaces a failure to archive after the delete was blocked', async () => {
    deleteResult = { error: { message: 'fk violation', code: '23503' } }
    archiveResult = { error: { message: 'network error', code: '500' } }

    await expect(deleteEquipment('eq-muse')).rejects.toEqual(archiveResult.error)
  })
})
