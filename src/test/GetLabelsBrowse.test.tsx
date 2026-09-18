import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchEquipment, listEquipment, listEquipmentUnits } from '../lib/inventory'
import GetReplacementLabelPage from '../pages/GetReplacementLabelPage'
import GetLabelsBrowsePage from '../pages/GetLabelsBrowsePage'
import GetLabelsProductPage from '../pages/GetLabelsProductPage'
import type { Equipment, EquipmentUnit } from '../types'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventory', () => ({
  listEquipment: vi.fn(),
  fetchEquipment: vi.fn(),
  listEquipmentUnits: vi.fn(),
  fetchEquipmentUnitBySerial: vi.fn(),
}))

// Rasterizing labels needs a real canvas; this screen only needs the markup.
vi.mock('../lib/labelPdf', () => ({
  buildItemLabelsPdf: vi.fn(),
  downloadLabelsPdf: vi.fn(),
  printLabelsPdf: vi.fn(),
}))

vi.mock('../components/admin-dashboard/labels/QrDocLabel', () => ({ QrDocLabel: () => null }))
vi.mock('../components/admin-dashboard/labels/SerialBarcodeLabel', () => ({ SerialBarcodeLabel: () => null }))

const mockSession = { user: { id: 'admin-1', email: 'admin@uw.edu' } } as unknown as Session

const mockProfile = {
  id: 'admin-1',
  first_name: 'Ada',
  last_name: 'Admin',
  role: 'admin' as const,
  uw_email: 'admin@uw.edu',
  discord: 'ada#0001',
  address: '123 Way',
}

function equipment(overrides: Partial<Equipment>): Equipment {
  return {
    id: 'eq-1',
    name: 'Muse 2',
    description: null,
    image_url: null,
    product_type: 'hardware',
    category: null,
    replacement_value: null,
    quantity_total: 2,
    documentation_url: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function unit(id: string, serial: string, equipmentId = 'eq-1'): EquipmentUnit {
  return { id, equipment_id: equipmentId, serial_number: serial, created_at: '2026-01-01T00:00:00Z' }
}

const muse = equipment({ id: 'eq-1', name: 'Muse 2' })
const oculus = equipment({ id: 'eq-2', name: 'Oculus Quest' })
const gel = equipment({ id: 'eq-3', name: 'Electrode gel', product_type: 'consumable' })

beforeEach(() => {
  vi.mocked(listEquipment).mockReset().mockResolvedValue([muse, oculus, gel])
  vi.mocked(fetchEquipment).mockReset().mockResolvedValue(muse)
  vi.mocked(listEquipmentUnits)
    .mockReset()
    .mockResolvedValue([unit('u1', 'SYN-AAA111'), unit('u2', 'SYN-BBB222')])
  vi.mocked(useAuth).mockReturnValue({
    session: mockSession,
    profile: mockProfile,
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
      { path: '/adminHome/get-labels', element: <GetReplacementLabelPage /> },
      { path: '/adminHome/get-labels/browse', element: <GetLabelsBrowsePage /> },
      { path: '/adminHome/get-labels/browse/:id', element: <GetLabelsProductPage /> },
    ],
    { initialEntries: ['/adminHome/get-labels'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('Get hardware labels — pick from database', () => {
  it('walks from the serial entry screen to every unit of a product', async () => {
    renderFlow()

    await userEvent.click(await screen.findByRole('button', { name: /pick from database/i }))

    expect(await screen.findByRole('button', { name: /oculus quest/i })).toBeInTheDocument()
    expect(screen.queryByText('Electrode gel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /muse 2/i }))

    expect(await screen.findByText('SYN-AAA111')).toBeInTheDocument()
    expect(screen.getByText('SYN-BBB222')).toBeInTheDocument()
    expect(listEquipmentUnits).toHaveBeenCalledWith('eq-1')
    expect(screen.getByRole('button', { name: 'Print label for SYN-AAA111' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download label for SYN-BBB222' })).toBeInTheDocument()
  })

  it('goes back one level at a time', async () => {
    renderFlow()

    await userEvent.click(await screen.findByRole('button', { name: /pick from database/i }))
    await userEvent.click(await screen.findByRole('button', { name: /muse 2/i }))
    await screen.findByText('SYN-AAA111')

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Pick from database' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('Serial number')).toBeInTheDocument()
  })

  it('says so when a product has no units', async () => {
    vi.mocked(listEquipmentUnits).mockResolvedValue([])
    renderFlow()

    await userEvent.click(await screen.findByRole('button', { name: /pick from database/i }))
    await userEvent.click(await screen.findByRole('button', { name: /muse 2/i }))

    const main = await screen.findByRole('main')
    expect(within(main).getByText(/no units of Muse 2/i)).toBeInTheDocument()
  })
})
