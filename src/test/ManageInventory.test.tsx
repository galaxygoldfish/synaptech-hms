import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchEquipmentInventorySummary } from '../lib/inventory'
import ManageInventory from '../components/admin-dashboard/ManageInventory'
import type { Equipment } from '../types'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventory', () => ({
  fetchEquipmentInventorySummary: vi.fn(),
  peekEquipmentInventorySummary: vi.fn(() => null),
}))

const muse = {
  id: 'eq-muse',
  name: 'Muse 2',
  image_url: null,
  quantity_total: 6,
} as unknown as Equipment

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'admin-1' } } as unknown as Session,
    profile: { id: 'admin-1', first_name: 'Ada', last_name: 'Admin', role: 'admin', uw_email: 'a@uw.edu' },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

describe('ManageInventory — counts', () => {
  it('counts held units separately, and leaves them out of what is available', async () => {
    vi.mocked(fetchEquipmentInventorySummary).mockResolvedValue([{ equipment: muse, checkedOut: 1, onHold: 2 }])

    render(
      <MemoryRouter>
        <ManageInventory />
      </MemoryRouter>,
    )

    const row = await screen.findByRole('button', { name: /Muse 2/ })
    const count = (label: string) => within(row).getByText(label).previousSibling
    expect(count('total')).toHaveTextContent('6')
    expect(count('checked out')).toHaveTextContent('1')
    expect(count('on hold')).toHaveTextContent('2')
    expect(count('available')).toHaveTextContent('3')
    expect(within(row).queryByText('in stock')).not.toBeInTheDocument()
  })
})
