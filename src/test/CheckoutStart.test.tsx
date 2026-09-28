import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchEquipment,
  fetchEquipmentAddonOptions,
  fetchEquipmentAvailability,
  listEquipment,
  peekEquipmentCatalog,
  peekEquipmentRows,
} from '../lib/inventory'
import CheckoutSelectHardware from '../components/user-dashboard/CheckoutSelectHardware'
import CheckoutConfirmHardware from '../components/user-dashboard/CheckoutConfirmHardware'
import type { Equipment } from '../types'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return {
    ...actual,
    listEquipment: vi.fn(),
    fetchEquipment: vi.fn(),
    fetchEquipmentAddonOptions: vi.fn(),
    fetchEquipmentAvailability: vi.fn(),
    peekEquipmentCatalog: vi.fn(),
    peekEquipmentRows: vi.fn(),
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
  documentation_url: null,
} as unknown as Equipment

const gel = { ...muse, id: 'eq-2', name: 'Gel pack', product_type: 'consumable', category: null } as unknown as Equipment

beforeEach(() => {
  vi.mocked(listEquipment).mockReset().mockResolvedValue([muse])
  vi.mocked(fetchEquipment).mockReset().mockResolvedValue(muse)
  vi.mocked(fetchEquipmentAvailability).mockReset().mockResolvedValue({ 'eq-1': 2 })
  vi.mocked(fetchEquipmentAddonOptions).mockReset().mockResolvedValue([])
  vi.mocked(peekEquipmentCatalog).mockReset().mockReturnValue([muse])
  vi.mocked(peekEquipmentRows).mockReset().mockImplementation((ids: string[]) =>
    ids.map((id) => (id === 'eq-1' ? muse : gel)),
  )
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'member-1', email: 'bob@uw.edu' } } as unknown as Session,
    profile: { id: 'member-1', first_name: 'Bob', last_name: 'Reyes', role: 'member', uw_email: 'bob@uw.edu', discord: 'bob', address: '1 Way' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function renderFlow() {
  const router = createMemoryRouter(
    [
      { path: '/home/checkout', element: <CheckoutSelectHardware /> },
      { path: '/home/checkout/confirm', element: <CheckoutConfirmHardware /> },
      { path: '/home/checkout/return-date', element: <p>Return date step</p> },
    ],
    { initialEntries: ['/home/checkout'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('starting a checkout from the list', () => {
  // The confirm step used to load, show its skeleton, then skip itself.
  it('goes straight to the return date for an item with no add-ons', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /muse 2/i }))

    expect(await screen.findByText('Return date step')).toBeInTheDocument()
    expect(screen.queryByText('Loading item…')).not.toBeInTheDocument()
  })

  it('opens the confirm step already drawn when there are add-ons, with no skeleton', async () => {
    vi.mocked(fetchEquipmentAddonOptions).mockResolvedValue([{ addonType: 'optional', equipment: gel }])

    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /muse 2/i }))

    expect(await screen.findByRole('heading', { name: 'Muse 2' })).toBeInTheDocument()
    expect(screen.getByText('Gel pack')).toBeInTheDocument()
    expect(screen.queryByText('Loading item…')).not.toBeInTheDocument()
    // Everything it needed arrived with the navigation.
    expect(fetchEquipment).not.toHaveBeenCalled()
  })

  // Stock is still read fresh at the moment of choosing.
  it('shows the confirm step as out of stock rather than skipping ahead', async () => {
    vi.mocked(fetchEquipmentAvailability).mockResolvedValue({ 'eq-1': 0 })

    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /muse 2/i }))

    expect(await screen.findByText('Out of stock')).toBeInTheDocument()
    expect(screen.queryByText('Return date step')).not.toBeInTheDocument()
  })
})
