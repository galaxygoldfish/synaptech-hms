import { renderHook, waitFor } from '@testing-library/react'
import { fetchEquipmentAvailability, listEquipment, peekEquipmentCatalog } from '../lib/inventory'
import { useInventoryCatalog } from '../lib/useInventoryCatalog'
import type { Equipment } from '../types'

vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return {
    ...actual,
    listEquipment: vi.fn(),
    fetchEquipmentAvailability: vi.fn(),
    peekEquipmentCatalog: vi.fn(),
  }
})

function item(id: string, name: string, quantity: number): Equipment {
  return { id, name, category: 'recording', product_type: 'hardware', quantity_total: quantity } as Equipment
}

beforeEach(() => {
  vi.mocked(peekEquipmentCatalog).mockReset().mockReturnValue(null)
  vi.mocked(listEquipment).mockReset().mockResolvedValue([item('eq-1', 'Muse 2', 5)])
  vi.mocked(fetchEquipmentAvailability).mockReset().mockResolvedValue({ 'eq-1': 3 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.mocked(console.error).mockRestore()
})

describe('useInventoryCatalog', () => {
  it('starts loading when nothing has been seen yet, then shows free units', async () => {
    const { result } = renderHook(() => useInventoryCatalog())

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.groups[0].items[0]).toMatchObject({ name: 'Muse 2', quantity_total: 3 })
  })

  // The grey-box fix: coming back to the catalog paints it straight away
  // instead of a skeleton, and the fresh counts replace it when they land.
  it('renders the last-seen catalog on the first render, then refreshes it', async () => {
    vi.mocked(peekEquipmentCatalog).mockReturnValue([item('eq-1', 'Muse 2', 1)])

    const { result } = renderHook(() => useInventoryCatalog())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.groups[0].items[0].quantity_total).toBe(1)
    await waitFor(() => expect(result.current.groups[0].items[0].quantity_total).toBe(3))
  })

  it('keeps the last-seen catalog on screen if the refresh fails', async () => {
    vi.mocked(peekEquipmentCatalog).mockReturnValue([item('eq-1', 'Muse 2', 1)])
    vi.mocked(fetchEquipmentAvailability).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useInventoryCatalog())

    await waitFor(() => expect(fetchEquipmentAvailability).toHaveBeenCalled())
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(result.current.error).toBeNull()
    expect(result.current.groups[0].items[0].name).toBe('Muse 2')
  })
})
