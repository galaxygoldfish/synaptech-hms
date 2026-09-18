import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllLoanRequestItems, type AdminLoanRequestItemSummary } from '../lib/loanRequests'
import { fetchEquipmentUnitBySerial } from '../lib/inventory'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import ReturnScan from '../components/admin-dashboard/return-hardware/ReturnScan'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return { ...actual, fetchAllLoanRequestItems: vi.fn() }
})

vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return { ...actual, fetchEquipmentUnitBySerial: vi.fn() }
})

// Mocked rather than emulating a camera: what matters here is what the
// screen does with a barcode once it has one.
vi.mock('../hooks/useBarcodeScanner', () => ({ useBarcodeScanner: vi.fn() }))

let detectBarcode: ((value: string) => void) | null = null

const mockSession = { user: { id: 'admin-1', email: 'admin@uw.edu' } } as unknown as Session

const adminProfile = {
  id: 'admin-1',
  first_name: 'Ada',
  last_name: 'Admin',
  role: 'admin' as const,
  uw_email: 'admin@uw.edu',
  discord: 'ada#0001',
  address: '123 Way',
}

function loan(overrides: Partial<AdminLoanRequestItemSummary> = {}): AdminLoanRequestItemSummary {
  return {
    id: 'item-1',
    equipmentId: 'eq-1',
    itemName: 'Muse 2',
    imageUrl: null,
    serialNumber: 'SYN-HJXPP41T5',
    status: 'approved',
    requestedAt: '2026-09-01T17:30:00Z',
    returnDate: '2099-10-12',
    returnRequestedAt: null,
    returnedAt: null,
    memberName: 'Bob Reyes',
    ...overrides,
  }
}

/** Out with someone right now — the one kind this flow can act on. */
const out = loan()

/** Requested but never collected: there is nothing to hand back. */
const neverCollected = loan({
  id: 'item-2',
  itemName: 'Jetson Nano',
  serialNumber: 'SYN-QQ92KD10T',
  status: 'pending',
  memberName: 'Cleo Park',
})

/** Already back on the shelf. */
const backAlready = loan({
  id: 'item-3',
  itemName: 'Oculus Quest 2',
  serialNumber: 'SYN-5OHTYJ2GX',
  returnRequestedAt: null,
  returnedAt: '2026-08-30T12:00:00Z',
  memberName: 'Dara Singh',
})

beforeEach(() => {
  detectBarcode = null
  vi.mocked(fetchAllLoanRequestItems)
    .mockReset()
    .mockResolvedValue([out, neverCollected, backAlready])
  vi.mocked(fetchEquipmentUnitBySerial).mockReset().mockResolvedValue(null)
  vi.mocked(useBarcodeScanner).mockReset().mockImplementation((onDetected) => {
    detectBarcode = onDetected
    return { videoRef: { current: null }, isSupported: true, permissionError: null }
  })
  vi.mocked(useAuth).mockReturnValue({
    session: mockSession,
    profile: adminProfile,
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

/** Reports the loan and the state step 2 was handed. */
function ConfirmStub() {
  const location = useLocation()
  const state = location.state as { serialVerifiedBy?: string } | null
  return <p>{`Confirm ${location.pathname} via ${state?.serialVerifiedBy ?? 'nothing'}`}</p>
}

function renderReturn() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/return', element: <ReturnScan /> },
      { path: '/adminHome/return/:id/confirm', element: <ConfirmStub /> },
      { path: '/adminHome/return/pick', element: <p>Pick a loan to return</p> },
      { path: '/adminHome', element: <p>Admin dashboard</p> },
    ],
    { initialEntries: ['/adminHome/return'] },
  )
  return render(<RouterProvider router={router} />)
}

/** Opens the typed-serial dialog, which is behind a button on the scan step. */
async function openSerialDialog() {
  await userEvent.click(
    await screen.findByRole('button', { name: /enter the serial number manually/i }),
  )
  return screen.getByRole('dialog', { name: /enter a serial number/i })
}

describe('ReturnScan', () => {
  it('waits for a barcode with both ways past the camera offered', async () => {
    renderReturn()

    expect(
      await screen.findByText(/please scan the hardware item barcode that is being returned/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /enter the serial number manually/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick the loan from the database/i })).toBeInTheDocument()
  })

  it('finds the open loan a scanned serial belongs to and goes on to confirm it', async () => {
    renderReturn()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-HJXPP41T5')

    expect(
      await screen.findByText('Confirm /adminHome/return/item-1/confirm via scan', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  // Labels are printed with the SYN- prefix but some scanners hand back only
  // the payload, so the lookup normalises both sides.
  it('accepts a barcode that omits the SYN- prefix', async () => {
    renderReturn()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('hjxpp41t5')

    expect(
      await screen.findByText(/Confirm \/adminHome\/return\/item-1\/confirm/, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  // Saying "not out on loan" here would send an admin looking for a record
  // that does exist, so the refusal names the actual state.
  it('refuses hardware that was requested but never handed over', async () => {
    renderReturn()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-QQ92KD10T')

    expect(
      await screen.findByText('Jetson Nano was never handed over to Cleo Park'),
    ).toBeInTheDocument()
  })

  // The double-return: the unit is on the shelf, and its last loan is closed.
  it('refuses a unit whose loan has already been returned', async () => {
    vi.mocked(fetchEquipmentUnitBySerial).mockResolvedValue({
      unit: { id: 'unit-3', equipment_id: 'eq-3', serial_number: 'SYN-5OHTYJ2GX', created_at: '' },
      equipment: { id: 'eq-3', name: 'Oculus Quest 2' } as never,
    })

    renderReturn()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-5OHTYJ2GX')

    expect(await screen.findByText('Oculus Quest 2 is not out on loan')).toBeInTheDocument()
  })

  it('calls a barcode from outside the inventory unrecognised', async () => {
    vi.mocked(fetchEquipmentUnitBySerial).mockResolvedValue(null)

    renderReturn()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-NOTOURS99')

    expect(await screen.findByText('SYN-NOTOURS99 is not recognised in inventory')).toBeInTheDocument()
  })

  // Typing a serial has to reach the same answer as scanning it, or the two
  // ways into the flow mean different things.
  it('resolves a serial typed by hand exactly as it resolves a scan', async () => {
    renderReturn()
    await openSerialDialog()

    await userEvent.type(screen.getByLabelText('Serial number'), 'HJXPP41T5{Enter}')

    expect(
      await screen.findByText('Confirm /adminHome/return/item-1/confirm via manual'),
    ).toBeInTheDocument()
  })

  it('answers a typed serial that resolves to nothing inside the dialog', async () => {
    renderReturn()
    await openSerialDialog()

    await userEvent.type(screen.getByLabelText('Serial number'), 'NOTOURS99')
    await userEvent.click(screen.getByRole('button', { name: 'Find loan' }))

    const dialog = await screen.findByRole('dialog', { name: /enter a serial number/i })
    expect(
      within(dialog).getByText('SYN-NOTOURS99 is not recognised in inventory'),
    ).toBeInTheDocument()
  })

  it('opens the return flow\'s own picker for hardware it cannot read', async () => {
    renderReturn()

    await userEvent.click(
      await screen.findByRole('button', { name: /pick the loan from the database/i }),
    )

    expect(await screen.findByText('Pick a loan to return')).toBeInTheDocument()
  })

  it('leaves the flow from the scan step', async () => {
    renderReturn()
    await screen.findByText(/please scan the hardware item barcode/i)

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByText('Admin dashboard')).toBeInTheDocument()
  })

  it('tells the admin to type the serial when no scanner can be loaded at all', async () => {
    vi.mocked(useBarcodeScanner).mockReturnValue({
      videoRef: { current: null },
      isSupported: false,
      permissionError: null,
    })

    renderReturn()

    expect(await screen.findByText(/enter the serial number by hand below/i)).toBeInTheDocument()
  })
})
