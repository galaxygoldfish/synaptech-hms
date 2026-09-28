import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchEquipment, fetchEquipmentAddonOptions, fetchEquipmentAvailability } from '../lib/inventory'
import CheckoutConfirmHardware from '../components/user-dashboard/CheckoutConfirmHardware'
import type { Equipment } from '../types'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return {
    ...actual,
    fetchEquipment: vi.fn(),
    fetchEquipmentAddonOptions: vi.fn(),
    fetchEquipmentAvailability: vi.fn(),
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

beforeEach(() => {
  vi.mocked(fetchEquipment).mockReset().mockResolvedValue(muse)
  vi.mocked(fetchEquipmentAddonOptions).mockReset().mockResolvedValue([])
  vi.mocked(fetchEquipmentAvailability).mockReset().mockResolvedValue({ 'eq-1': 2 })
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

function renderConfirm() {
  const router = createMemoryRouter(
    [
      { path: '/home/checkout/confirm', element: <CheckoutConfirmHardware /> },
      { path: '/home/checkout/return-date', element: <p>Return date step</p> },
    ],
    { initialEntries: [{ pathname: '/home/checkout/confirm', state: { equipmentId: 'eq-1' } }] },
  )
  return render(<RouterProvider router={router} />)
}

describe('CheckoutConfirmHardware', () => {
  // The flash: an item with no add-ons skips this step, and used to draw the
  // whole item page for a frame on its way past.
  it('goes straight to the return date for an item with no add-ons, without drawing the item', async () => {
    const seen: string[] = []
    const observer = new MutationObserver(() => {
      if (document.body.textContent?.includes('Muse 2')) seen.push('item drawn')
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    renderConfirm()

    expect(await screen.findByText('Return date step')).toBeInTheDocument()
    observer.disconnect()
    expect(seen).toEqual([])
  })

  it('still shows the item when there are add-ons to choose', async () => {
    vi.mocked(fetchEquipmentAddonOptions).mockResolvedValue([
      {
        addonType: 'optional',
        equipment: { ...muse, id: 'eq-2', name: 'Gel pack' },
      },
    ] as unknown as Awaited<ReturnType<typeof fetchEquipmentAddonOptions>>)

    renderConfirm()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.queryByText('Return date step')).not.toBeInTheDocument()
  })
})
