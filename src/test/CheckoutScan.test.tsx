import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllLoanRequestItems, type AdminLoanRequestItemSummary } from '../lib/loanRequests'
import { fetchEquipmentUnitBySerial } from '../lib/inventory'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import CheckoutScan from '../components/admin-dashboard/checkout-hardware/CheckoutScan'

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
// screen does with a barcode once it has one, and the test needs to hand it
// specific values to check that.
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

/** Requested and waiting to be handed over — what this screen is for. */
const requested: AdminLoanRequestItemSummary = {
  id: 'item-1',
  equipmentId: 'eq-1',
  itemName: 'Muse 2',
  imageUrl: null,
  serialNumber: 'SYN-HJXPP41T5',
  status: 'pending',
  requestedAt: '2026-09-14T17:30:00Z',
  returnDate: '2026-10-12',
  returnedAt: null,
  memberName: 'Bob Reyes',
}

/** Already approved and never returned — out with somebody right now. */
const alreadyOut: AdminLoanRequestItemSummary = {
  id: 'item-2',
  equipmentId: 'eq-2',
  itemName: 'Jetson Nano',
  imageUrl: null,
  serialNumber: 'SYN-QQ92KD10T',
  status: 'approved',
  requestedAt: '2026-09-01T17:30:00Z',
  returnDate: '2026-10-01',
  returnedAt: null,
  memberName: 'Cleo Park',
}

/** In stock: its last loan came back, and nobody has asked for it since. */
const backOnTheShelf: AdminLoanRequestItemSummary = {
  id: 'item-3',
  equipmentId: 'eq-3',
  itemName: 'Oculus Quest 2',
  imageUrl: null,
  serialNumber: 'SYN-5OHTYJ2GX',
  status: 'approved',
  requestedAt: '2026-08-01T17:30:00Z',
  returnDate: '2026-09-01',
  returnedAt: '2026-08-30T12:00:00Z',
  memberName: 'Dara Singh',
}

beforeEach(() => {
  detectBarcode = null
  vi.mocked(fetchAllLoanRequestItems)
    .mockReset()
    .mockResolvedValue([requested, alreadyOut, backOnTheShelf])
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

function renderCheckout() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/checkout', element: <CheckoutScan /> },
      { path: '/adminHome/checkout/:id/agreement', element: <p>Loan agreement sign off</p> },
      { path: '/adminHome/checkout/pick', element: <p>Pick a loan request</p> },
      { path: '/adminHome', element: <p>Admin dashboard</p> },
    ],
    { initialEntries: ['/adminHome/checkout'] },
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

describe('CheckoutScan', () => {
  it('waits for a barcode with both ways past the camera offered', async () => {
    renderCheckout()

    expect(
      await screen.findByText(/please scan the hardware item barcode that you are checking out/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /enter the serial number manually/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick the loan from the database/i })).toBeInTheDocument()
    // The field is behind the button, not sitting on the screen beside it.
    expect(screen.queryByLabelText('Serial number')).not.toBeInTheDocument()
  })

  // The heart of the flow: a barcode is only a serial number, and this is
  // what turns it into "this is Bob's, and he's owed it".
  it('finds the open request a scanned serial belongs to and repeats it back', async () => {
    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-HJXPP41T5')

    expect(await screen.findByText('Muse 2', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('SYN-HJXPP41T5')).toBeInTheDocument()
    expect(screen.getByText('Bob Reyes')).toBeInTheDocument()
    expect(screen.getByText('October 12, 2026')).toBeInTheDocument()
    // Nothing is recorded yet — the agreement is still ahead.
    expect(screen.queryByText('Loan agreement sign off')).not.toBeInTheDocument()
  })

  // Labels are printed with the SYN- prefix but some scanners hand back only
  // the payload, so the lookup normalises both sides.
  it('accepts a barcode that omits the SYN- prefix', async () => {
    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('hjxpp41t5')

    expect(await screen.findByText('Muse 2', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('goes on to the agreement once the admin confirms the loan', async () => {
    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-HJXPP41T5')
    await screen.findByText('Muse 2', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: 'continue' }))

    expect(await screen.findByText('Loan agreement sign off')).toBeInTheDocument()
  })

  // Backing out of the wrong loan is the top row's Back button, the same as
  // everywhere else — the card itself offers only the way forward.
  it('goes back to scanning from the confirmed loan', async () => {
    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-HJXPP41T5')
    await screen.findByText('Muse 2', {}, { timeout: 3000 })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByText(/please scan the hardware item barcode/i)).toBeInTheDocument()
    expect(screen.queryByText('Handing to')).not.toBeInTheDocument()
  })

  it('leaves the flow from the scan step, where there is nothing to back out of', async () => {
    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(await screen.findByText('Admin dashboard')).toBeInTheDocument()
  })

  // Handing the same unit to a second person is the mistake with the worst
  // ending, so it's named rather than reported as a failed scan.
  it('refuses a unit that is already out, and says who has it', async () => {
    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-QQ92KD10T')

    expect(
      await screen.findByText('Jetson Nano is already checked out to Cleo Park'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'continue' })).not.toBeInTheDocument()
  })

  // A returned loan is history. The unit is on the shelf, so the answer is
  // "nobody asked for this", not "this was Dara's".
  it('treats a returned loan as no request at all', async () => {
    vi.mocked(fetchEquipmentUnitBySerial).mockResolvedValue({
      unit: { id: 'unit-3', equipment_id: 'eq-3', serial_number: 'SYN-5OHTYJ2GX', created_at: '' },
      equipment: { id: 'eq-3', name: 'Oculus Quest 2' } as never,
    })

    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-5OHTYJ2GX')

    expect(await screen.findByText('Oculus Quest 2 has no open checkout request')).toBeInTheDocument()
    expect(screen.queryByText('Dara Singh')).not.toBeInTheDocument()
  })

  it('calls a barcode from outside the inventory unrecognised', async () => {
    vi.mocked(fetchEquipmentUnitBySerial).mockResolvedValue(null)

    renderCheckout()
    await screen.findByText(/please scan the hardware item barcode/i)

    detectBarcode?.('SYN-NOTOURS99')

    expect(await screen.findByText('SYN-NOTOURS99 is not recognised in inventory')).toBeInTheDocument()
  })

  // Typing a serial has to reach the same answer as scanning it, or the two
  // ways into the flow mean different things.
  it('resolves a serial typed by hand exactly as it resolves a scan', async () => {
    renderCheckout()
    await openSerialDialog()

    await userEvent.type(screen.getByLabelText('Serial number'), 'HJXPP41T5')
    await userEvent.click(screen.getByRole('button', { name: 'Find loan' }))

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.getByText('Bob Reyes')).toBeInTheDocument()
    // The dialog closes behind a serial that resolved.
    expect(screen.queryByRole('dialog', { name: /enter a serial number/i })).not.toBeInTheDocument()
  })

  it('submits a typed serial on Enter', async () => {
    renderCheckout()
    await openSerialDialog()

    await userEvent.type(screen.getByLabelText('Serial number'), 'HJXPP41T5{Enter}')

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
  })

  // There is no viewfinder to put a marker over when the serial was typed,
  // so the refusal goes where the admin is looking: inside the dialog, which
  // stays open so they can correct what they typed.
  it('answers a typed serial that resolves to nothing inside the dialog', async () => {
    renderCheckout()
    await openSerialDialog()

    await userEvent.type(screen.getByLabelText('Serial number'), 'NOTOURS99')
    await userEvent.click(screen.getByRole('button', { name: 'Find loan' }))

    const dialog = await screen.findByRole('dialog', { name: /enter a serial number/i })
    expect(
      within(dialog).getByText('SYN-NOTOURS99 is not recognised in inventory'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Handing to')).not.toBeInTheDocument()
  })

  it('hints at the shape of a serial without showing a real one', async () => {
    renderCheckout()
    await openSerialDialog()

    expect(screen.getByLabelText('Serial number')).toHaveAttribute('placeholder', 'XXXXXXXXX')
  })

  it('drops what was typed when the dialog is cancelled', async () => {
    renderCheckout()
    await openSerialDialog()

    await userEvent.type(screen.getByLabelText('Serial number'), 'HJXPP41T5')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: /enter a serial number/i })).not.toBeInTheDocument()

    await openSerialDialog()
    expect(screen.getByLabelText('Serial number')).toHaveValue('')
  })

  // Its own screen inside this flow, not the "Hardware loans" record — that
  // one answers a different question and offers rows different things.
  it('opens the checkout flow\'s own picker for hardware it cannot read', async () => {
    renderCheckout()

    await userEvent.click(
      await screen.findByRole('button', { name: /pick the loan from the database/i }),
    )

    expect(await screen.findByText('Pick a loan request')).toBeInTheDocument()
  })

  it('tells the admin to type the serial when no scanner can be loaded at all', async () => {
    vi.mocked(useBarcodeScanner).mockReturnValue({
      videoRef: { current: null },
      isSupported: false,
      permissionError: null,
    })

    renderCheckout()

    expect(await screen.findByText(/enter the serial number by hand below/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /enter the serial number manually/i }),
    ).toBeInTheDocument()
  })
})
