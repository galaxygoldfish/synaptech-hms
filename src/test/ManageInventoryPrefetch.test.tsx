import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchEquipment,
  fetchEquipmentAddonOptions,
  fetchEquipmentCheckedOutCount,
  fetchEquipmentInventorySummary,
  fetchEquipmentUnitsWithStatus,
  listEquipment,
  peekEquipmentInventorySummary,
  prefetchManageItem,
  readManageItemPrefetch,
  readManageItemUnitsPrefetch,
} from '../lib/inventory'
import ManageInventory from '../components/admin-dashboard/ManageInventory'
import ManageInventoryItemPage from '../pages/ManageInventoryItemPage'
import type { Equipment } from '../types'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return {
    ...actual,
    fetchEquipment: vi.fn(),
    fetchEquipmentAddonOptions: vi.fn(),
    fetchEquipmentCheckedOutCount: vi.fn(),
    fetchEquipmentInventorySummary: vi.fn(),
    fetchEquipmentUnitsWithStatus: vi.fn(),
    listEquipment: vi.fn(),
    peekEquipmentInventorySummary: vi.fn(),
    prefetchManageItem: vi.fn(),
    readManageItemPrefetch: vi.fn(),
    readManageItemUnitsPrefetch: vi.fn(),
  }
})

const muse = {
  id: 'eq-1',
  name: 'Muse 2',
  description: 'EEG headband',
  image_url: null,
  product_type: 'hardware',
  category: 'recording',
  quantity_total: 4,
  replacement_value: 250,
  documentation_url: null,
} as unknown as Equipment

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'admin-1', email: 'ada@uw.edu' } } as unknown as Session,
    profile: { id: 'admin-1', first_name: 'Ada', last_name: 'Admin', role: 'admin', uw_email: 'ada@uw.edu', discord: 'ada', address: '1 Way' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(fetchEquipmentInventorySummary).mockReset().mockResolvedValue([{ equipment: muse, checkedOut: 1 }])
  vi.mocked(peekEquipmentInventorySummary).mockReset().mockReturnValue(null)
  vi.mocked(prefetchManageItem).mockReset().mockResolvedValue({ equipment: muse, checkedOutCount: 1, addonOptions: [] })
  vi.mocked(readManageItemPrefetch).mockReset().mockReturnValue(undefined)
  vi.mocked(readManageItemUnitsPrefetch).mockReset().mockReturnValue(undefined)
  vi.mocked(fetchEquipment).mockReset().mockResolvedValue(muse)
  vi.mocked(fetchEquipmentCheckedOutCount).mockReset().mockResolvedValue(1)
  vi.mocked(fetchEquipmentAddonOptions).mockReset().mockResolvedValue([])
  vi.mocked(fetchEquipmentUnitsWithStatus).mockReset().mockResolvedValue([])
  vi.mocked(listEquipment).mockReset().mockResolvedValue([muse])
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/inventory', element: <ManageInventory /> },
      { path: '/adminHome/inventory/:id', element: <ManageInventoryItemPage /> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('admin inventory without skeletons', () => {
  it('shows the last-loaded list on the first render', () => {
    vi.mocked(peekEquipmentInventorySummary).mockReturnValue([{ equipment: muse, checkedOut: 1 }])

    renderAt('/adminHome/inventory')

    expect(screen.getByText('Muse 2')).toBeInTheDocument()
  })

  it("fetches an item's data before opening it", async () => {
    let finishPrefetch: () => void = () => {}
    vi.mocked(prefetchManageItem).mockReturnValue(
      new Promise((resolve) => (finishPrefetch = () => resolve({ equipment: muse, checkedOutCount: 1, addonOptions: [] }))),
    )

    renderAt('/adminHome/inventory')
    await userEvent.click(await screen.findByText('Muse 2'))

    expect(prefetchManageItem).toHaveBeenCalledWith('eq-1')
    // Still on the list while it loads.
    expect(screen.queryByDisplayValue('Muse 2')).not.toBeInTheDocument()
    finishPrefetch()
    expect(await screen.findByDisplayValue('Muse 2')).toBeInTheDocument()
  })

  it('builds the edit form from prefetched data on the first render, without refetching', () => {
    vi.mocked(readManageItemPrefetch).mockReturnValue({ equipment: muse, checkedOutCount: 1, addonOptions: [] })
    vi.mocked(readManageItemUnitsPrefetch).mockReturnValue([])

    renderAt('/adminHome/inventory/eq-1')

    expect(screen.getByDisplayValue('Muse 2')).toBeInTheDocument()
    expect(screen.queryByText('Loading product details…')).not.toBeInTheDocument()
    expect(fetchEquipment).not.toHaveBeenCalled()
    expect(fetchEquipmentUnitsWithStatus).not.toHaveBeenCalled()
  })

  it('loads the ordinary way when opened directly', async () => {
    renderAt('/adminHome/inventory/eq-1')

    expect(await screen.findByDisplayValue('Muse 2')).toBeInTheDocument()
    expect(fetchEquipment).toHaveBeenCalledWith('eq-1')
  })
})
