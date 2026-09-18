import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchAuditableInventory,
  recordInventoryAudit,
  type AuditableUnit,
} from '../lib/inventoryAudit'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import InventoryAuditScan from '../components/admin-dashboard/InventoryAuditScan'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventoryAudit', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventoryAudit')>('../lib/inventoryAudit')
  return { ...actual, fetchAuditableInventory: vi.fn(), recordInventoryAudit: vi.fn() }
})

// Mocked rather than emulating a camera: what matters is what the screen does
// with a barcode once it has one, and the test needs to feed it specific
// values in a specific order. Same approach as HandOffScan.test.tsx.
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

// Two units on the shelf and one out with a member, which is the smallest
// inventory that exercises every outcome the screen can report.
const onShelf: AuditableUnit = {
  unitId: 'unit-1',
  serialNumber: 'SYN-AAA111AAA',
  equipmentId: 'eq-1',
  equipmentName: 'Muse 2',
  imageUrl: null,
  expectation: 'in_stock',
  memberName: null,
}

const alsoOnShelf: AuditableUnit = {
  unitId: 'unit-2',
  serialNumber: 'SYN-BBB222BBB',
  equipmentId: 'eq-2',
  equipmentName: 'Jetson Nano',
  imageUrl: null,
  expectation: 'in_stock',
  memberName: null,
}

const outOnLoan: AuditableUnit = {
  unitId: 'unit-3',
  serialNumber: 'SYN-CCC333CCC',
  equipmentId: 'eq-3',
  equipmentName: 'Oculus Quest 2',
  imageUrl: null,
  expectation: 'checked_out',
  memberName: 'Bob Reyes',
}

beforeEach(() => {
  detectBarcode = null
  vi.mocked(fetchAuditableInventory).mockReset().mockResolvedValue([onShelf, alsoOnShelf, outOnLoan])
  vi.mocked(recordInventoryAudit).mockReset().mockResolvedValue('audit-1')
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
      { path: '/adminHome/inventory/audit/new', element: <InventoryAuditScan /> },
      { path: '/adminHome/inventory/audit/:id', element: <p>Audit report</p> },
      { path: '/adminHome/inventory/audit', element: <p>Past audits</p> },
    ],
    { initialEntries: ['/adminHome/inventory/audit/new'] },
  )
  return render(<RouterProvider router={router} />)
}

function chip(name: RegExp) {
  return screen.getByRole('button', { name })
}

describe('InventoryAuditScan', () => {
  it('opens on what is still missing, counting only what the records put in stock', async () => {
    renderScan()

    // Two units in stock, so two to find — the unit out on loan is not one of
    // them, which is the distinction the whole screen rests on.
    expect(await screen.findByText('0 of 2 confirmed in stock')).toBeInTheDocument()
    expect(screen.getByText('2 still to find')).toBeInTheDocument()

    const missing = screen.getByRole('list')
    expect(within(missing).getByText('Muse 2')).toBeInTheDocument()
    expect(within(missing).getByText('Jetson Nano')).toBeInTheDocument()
    expect(within(missing).queryByText('Oculus Quest 2')).not.toBeInTheDocument()
  })

  it('confirms a scanned unit and takes it off the missing list', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    detectBarcode?.('SYN-AAA111AAA')

    expect(await screen.findByText('1 of 2 confirmed in stock')).toBeInTheDocument()
    expect(screen.getByText(/Muse 2 counted/)).toBeInTheDocument()
    expect(within(screen.getByRole('list')).queryByText('Muse 2')).not.toBeInTheDocument()
  })

  it('accepts a barcode without the SYN- prefix', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    // What a reader returns for a Code 128 label varies; normalising is what
    // keeps "AAA111AAA" matching "SYN-AAA111AAA".
    detectBarcode?.('aaa111aaa')

    expect(await screen.findByText('1 of 2 confirmed in stock')).toBeInTheDocument()
  })

  it('counts a repeated scan once and says so', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    detectBarcode?.('SYN-AAA111AAA')
    await screen.findByText('1 of 2 confirmed in stock')
    detectBarcode?.('SYN-AAA111AAA')

    expect(await screen.findByText(/Already counted/)).toBeInTheDocument()
    expect(screen.getByText('1 of 2 confirmed in stock')).toBeInTheDocument()
  })

  it('flags a unit found on the shelf that the records say is out on loan', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    detectBarcode?.('SYN-CCC333CCC')

    expect(await screen.findByText(/marked out with Bob Reyes/)).toBeInTheDocument()
    // It doesn't become a confirmation: the records and the shelf disagree,
    // and the audit's job is to say so, not to pick a side.
    expect(screen.getByText('0 of 2 confirmed in stock')).toBeInTheDocument()

    await userEvent.click(chip(/^Flagged/))
    expect(within(screen.getByRole('list')).getByText('Oculus Quest 2')).toBeInTheDocument()
  })

  it('flags a barcode that matches nothing in inventory', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    detectBarcode?.('SYN-ZZZ999ZZZ')

    expect(await screen.findByText(/SYN-ZZZ999ZZZ is not recognised in inventory/)).toBeInTheDocument()

    await userEvent.click(chip(/^Flagged/))
    expect(within(screen.getByRole('list')).getByText('Not in inventory')).toBeInTheDocument()
  })

  it('counts a serial typed by hand, for when the camera or the label will not cooperate', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    await userEvent.type(screen.getByLabelText('Serial number'), 'BBB222BBB')
    await userEvent.click(screen.getByRole('button', { name: 'Count it' }))

    expect(await screen.findByText('1 of 2 confirmed in stock')).toBeInTheDocument()
    expect(screen.getByLabelText('Serial number')).toHaveValue('')
  })

  it('records every unit in inventory, not just the scanned ones, and opens the report', async () => {
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    detectBarcode?.('SYN-AAA111AAA')
    await screen.findByText('1 of 2 confirmed in stock')

    await userEvent.type(screen.getByLabelText(/Note for the report/), 'north shelf only')
    await userEvent.click(screen.getByRole('button', { name: /finish audit/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Record audit$/ }))

    await waitFor(() => expect(recordInventoryAudit).toHaveBeenCalled())
    const [entries, note] = vi.mocked(recordInventoryAudit).mock.calls[0]
    expect(note).toBe('north shelf only')
    // A report that only listed what turned up couldn't be read back as
    // "these two were missing" — the absences are the finding.
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serialNumber: 'SYN-AAA111AAA', status: 'confirmed' }),
        expect.objectContaining({ serialNumber: 'SYN-BBB222BBB', status: 'missing' }),
        expect.objectContaining({ serialNumber: 'SYN-CCC333CCC', status: 'checked_out' }),
      ]),
    )

    expect(await screen.findByText('Audit report')).toBeInTheDocument()
  })

  it('keeps the audit on screen when recording it fails', async () => {
    vi.mocked(recordInventoryAudit).mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderScan()
    await screen.findByText('0 of 2 confirmed in stock')

    await userEvent.click(screen.getByRole('button', { name: /finish audit/i }))
    await userEvent.click(screen.getByRole('button', { name: /^Record audit$/ }))

    expect(await screen.findByText(/Nothing was saved/)).toBeInTheDocument()
    // Still scannable: a failed save must not cost the auditor the shelf they
    // already walked.
    expect(screen.getByText('0 of 2 confirmed in stock')).toBeInTheDocument()
  })

  it('offers typing serials instead when the device has no barcode scanner', async () => {
    vi.mocked(useBarcodeScanner).mockImplementation(() => ({
      videoRef: { current: null },
      isSupported: false,
      permissionError: null,
    }))
    renderScan()

    expect(await screen.findByText(/Enter serial numbers by hand below/)).toBeInTheDocument()
    expect(screen.getByLabelText('Serial number')).toBeInTheDocument()
  })

  it('says there is nothing to audit rather than showing an empty shelf', async () => {
    vi.mocked(fetchAuditableInventory).mockResolvedValue([])
    renderScan()

    expect(await screen.findByText(/no serialised hardware units in inventory to audit/i)).toBeInTheDocument()
  })
})
