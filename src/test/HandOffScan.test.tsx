import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchLoanRequestItemDetail, type AdminLoanRequestDetail } from '../lib/loanRequests'
import { fetchEquipmentUnitBySerial } from '../lib/inventory'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import HandOffScan from '../components/admin-dashboard/HandOffScan'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return { ...actual, fetchLoanRequestItemDetail: vi.fn() }
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

const loan = {
  id: 'item-1',
  loanRequestId: 'req-1',
  equipmentId: 'eq-1',
  itemName: 'Muse 2',
  itemDescription: null,
  imageUrl: null,
  serialNumber: 'SYN-HJXPP41T5',
  itemRole: 'primary' as const,
  status: 'pending' as const,
  requestedAt: '2026-09-17T17:30:00Z',
  returnDate: '2026-10-08',
  signedAgreementPath: 'bob/req-1/eq-1.pdf',
  signatureName: 'Bob Reyes',
  signatureDate: '2026-09-17',
  reviewedAt: null,
  reviewNote: null,
  returnRequestedAt: null,
  returnedAt: null,
  returnedByName: null,
  memberId: 'member-1',
  memberName: 'Bob Reyes',
  memberEmail: 'bob@uw.edu',
  memberDiscord: 'bobreyes',
  reviewerName: null,
  otherItems: [],
} satisfies AdminLoanRequestDetail

beforeEach(() => {
  detectBarcode = null
  vi.mocked(fetchLoanRequestItemDetail).mockReset().mockResolvedValue(loan)
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

function renderScan() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/loans/:id/hand-off', element: <HandOffScan /> },
      {
        path: '/adminHome/loans/:id/hand-off/agreement',
        element: <p>Loan agreement sign off</p>,
      },
    ],
    { initialEntries: ['/adminHome/loans/item-1/hand-off'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('HandOffScan', () => {
  it('shows what is being handed over while it waits for a scan', async () => {
    renderScan()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.getByText(/SYN-HJXPP41T5 · handing to Bob Reyes/)).toBeInTheDocument()
    expect(screen.getByText(/scan the barcode of the item being handed off/i)).toBeInTheDocument()
  })

  it('moves to the agreement when the scanned barcode is the right unit', async () => {
    renderScan()
    await screen.findByText('Muse 2')

    detectBarcode?.('SYN-HJXPP41T5')

    expect(await screen.findByText('Loan agreement sign off', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  // Labels are printed with the SYN- prefix but some scanners hand back only
  // the payload, so the comparison normalises both sides.
  it('accepts a barcode that omits the SYN- prefix', async () => {
    renderScan()
    await screen.findByText('Muse 2')

    detectBarcode?.('hjxpp41t5')

    expect(await screen.findByText('Loan agreement sign off', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('confirms a good scan before moving on', async () => {
    renderScan()
    await screen.findByText('Muse 2')

    detectBarcode?.('SYN-HJXPP41T5')

    // The tick lands first and holds, so the admin sees the scan was read.
    expect(await screen.findByText('Serial number verified')).toBeInTheDocument()
    expect(await screen.findByText('Loan agreement sign off', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  // The case this step exists to catch: two units of one product look
  // identical, and handing over the wrong one puts it against the wrong loan.
  it("calls a label from another unit the wrong serial, not an unknown one", async () => {
    // The scanned serial is a real unit, just not this loan's.
    vi.mocked(fetchEquipmentUnitBySerial).mockResolvedValue({
      unit: { id: 'unit-2', equipment_id: 'eq-1', serial_number: 'SYN-WRONG123', created_at: '' },
      equipment: { id: 'eq-1', name: 'Muse 2' } as never,
    })

    renderScan()
    await screen.findByText('Muse 2')

    detectBarcode?.('SYN-WRONG123')

    expect(await screen.findByText('Wrong serial number')).toBeInTheDocument()
    expect(screen.queryByText('Loan agreement sign off')).not.toBeInTheDocument()
  })

  it('calls a barcode from outside the inventory unrecognised', async () => {
    vi.mocked(fetchEquipmentUnitBySerial).mockResolvedValue(null)

    renderScan()
    await screen.findByText('Muse 2')

    detectBarcode?.('SYN-NOTOURS99')

    expect(await screen.findByText('Not recognised in inventory')).toBeInTheDocument()
    expect(screen.queryByText('Loan agreement sign off')).not.toBeInTheDocument()
  })

  it('lets an admin attest instead, but makes them confirm the serial first', async () => {
    renderScan()
    await userEvent.click(await screen.findByRole('button', { name: /manually attest to serial number/i }))

    const dialog = screen.getByRole('dialog', { name: /attest to the serial number/i })
    expect(dialog).toHaveTextContent('SYN-HJXPP41T5')
    expect(screen.queryByText('Loan agreement sign off')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Yes, it matches' }))
    expect(await screen.findByText('Loan agreement sign off')).toBeInTheDocument()
  })

  it('stays put if the attestation is cancelled', async () => {
    renderScan()
    await userEvent.click(await screen.findByRole('button', { name: /manually attest to serial number/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Loan agreement sign off')).not.toBeInTheDocument()
  })

  it('tells the admin to attest when no scanner can be loaded at all', async () => {
    vi.mocked(useBarcodeScanner).mockReturnValue({
      videoRef: { current: null },
      isSupported: false,
      permissionError: null,
    })

    renderScan()

    expect(await screen.findByText(/barcode scanning isn.t available here/i)).toBeInTheDocument()
  })
})
