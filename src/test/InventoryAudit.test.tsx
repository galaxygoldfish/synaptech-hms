import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchInventoryAudit,
  fetchInventoryAudits,
  type InventoryAuditDetail,
  type InventoryAuditEntry,
  type InventoryAuditSummary,
} from '../lib/inventoryAudit'
import InventoryAudit from '../components/admin-dashboard/InventoryAudit'
import InventoryAuditReport from '../components/admin-dashboard/InventoryAuditReport'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/inventoryAudit', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventoryAudit')>('../lib/inventoryAudit')
  return { ...actual, fetchInventoryAudits: vi.fn(), fetchInventoryAudit: vi.fn() }
})

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

function summary(overrides: Partial<InventoryAuditSummary> = {}): InventoryAuditSummary {
  return {
    id: 'audit-1',
    performedAt: '2026-09-18T17:30:00.000Z',
    performedByName: 'Ada Admin',
    performedByEmail: 'admin@uw.edu',
    note: null,
    expectedCount: 4,
    confirmedCount: 4,
    missingCount: 0,
    checkedOutCount: 2,
    foundCheckedOutCount: 0,
    unrecognizedCount: 0,
    ...overrides,
  }
}

function entry(overrides: Partial<InventoryAuditEntry>): InventoryAuditEntry {
  return {
    id: 'entry-1',
    status: 'confirmed',
    serialNumber: 'SYN-AAA111AAA',
    equipmentUnitId: 'unit-1',
    equipmentId: 'eq-1',
    equipmentName: 'Muse 2',
    memberName: null,
    scannedAt: '2026-09-18T17:31:00.000Z',
    imageUrl: 'https://example.test/muse.png',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(fetchInventoryAudits).mockReset().mockResolvedValue({ audits: [summary()], hasMore: false })
  vi.mocked(fetchInventoryAudit).mockReset()
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

function renderList() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/inventory/audit', element: <InventoryAudit /> },
      { path: '/adminHome/inventory/audit/new', element: <p>New audit scan</p> },
      { path: '/adminHome/inventory/audit/:id', element: <p>Report for one audit</p> },
    ],
    { initialEntries: ['/adminHome/inventory/audit'] },
  )
  return render(<RouterProvider router={router} />)
}

function renderReport() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/inventory/audit/:id', element: <InventoryAuditReport /> },
      { path: '/adminHome/inventory/audit', element: <p>Past audits</p> },
    ],
    { initialEntries: ['/adminHome/inventory/audit/audit-1'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('InventoryAudit', () => {
  it('summarises a clean audit as all accounted for', async () => {
    renderList()

    expect(await screen.findByText('Confirmed 4 of 4 units in stock')).toBeInTheDocument()
    expect(screen.getByText('All accounted for')).toBeInTheDocument()
    // Who ran it reads as one line under the headline, name and address
    // together, rather than as its own column.
    expect(screen.getByText('Performed by Ada Admin · admin@uw.edu')).toBeInTheDocument()
    expect(screen.getByText(/Sep 18, 2026/)).toBeInTheDocument()
  })

  // Missing hardware is the finding an audit exists for, so it has to win the
  // badge even when there are other discrepancies competing for it.
  it('leads with missing hardware over any other discrepancy', async () => {
    vi.mocked(fetchInventoryAudits).mockResolvedValue({
      audits: [summary({ confirmedCount: 2, missingCount: 2, foundCheckedOutCount: 1, unrecognizedCount: 3 })],
      hasMore: false,
    })
    renderList()

    expect(await screen.findByText('2 missing')).toBeInTheDocument()
    expect(screen.queryByText('1 discrepancy')).not.toBeInTheDocument()
    expect(screen.queryByText('4 discrepancies')).not.toBeInTheDocument()
  })

  it('reports discrepancies when nothing is missing but something is off', async () => {
    vi.mocked(fetchInventoryAudits).mockResolvedValue({
      audits: [summary({ foundCheckedOutCount: 1 })],
      hasMore: false,
    })
    renderList()

    expect(await screen.findByText('1 discrepancy')).toBeInTheDocument()
  })

  it('starts a new audit from the plus button', async () => {
    renderList()
    await screen.findByText('Confirmed 4 of 4 units in stock')

    await userEvent.click(screen.getByRole('button', { name: /New audit/ }))

    expect(await screen.findByText('New audit scan')).toBeInTheDocument()
  })

  it('opens a past audit', async () => {
    renderList()

    await userEvent.click(await screen.findByRole('button', { name: /Confirmed 4 of 4 units in stock/ }))

    expect(await screen.findByText('Report for one audit')).toBeInTheDocument()
  })

  it('invites a first audit rather than showing an empty list', async () => {
    vi.mocked(fetchInventoryAudits).mockResolvedValue({ audits: [], hasMore: false })
    renderList()

    expect(await screen.findByText(/No audits have been recorded yet/)).toBeInTheDocument()
  })

  it('filters past audits by who ran them', async () => {
    vi.mocked(fetchInventoryAudits).mockResolvedValue({
      audits: [summary(), summary({ id: 'audit-2', performedByName: 'Bo Manager', performedByEmail: 'bo@uw.edu' })],
      hasMore: false,
    })
    renderList()
    await screen.findByText(/Performed by Ada Admin/)

    await userEvent.type(screen.getByLabelText('Search past audits'), 'Bo Manager')

    expect(screen.getByText(/Performed by Bo Manager/)).toBeInTheDocument()
    expect(screen.queryByText(/Performed by Ada Admin/)).not.toBeInTheDocument()
  })
})

describe('InventoryAuditReport', () => {
  const detail: InventoryAuditDetail = {
    ...summary({ confirmedCount: 1, missingCount: 1, checkedOutCount: 1, unrecognizedCount: 1, expectedCount: 2 }),
    note: 'north shelf only',
    entries: [
      entry({ id: 'e1', status: 'confirmed' }),
      entry({
        id: 'e2',
        status: 'missing',
        serialNumber: 'SYN-BBB222BBB',
        equipmentName: 'Jetson Nano',
        scannedAt: null,
      }),
      entry({
        id: 'e3',
        status: 'checked_out',
        serialNumber: 'SYN-CCC333CCC',
        equipmentName: 'Oculus Quest 2',
        memberName: 'Bob Reyes',
        scannedAt: null,
      }),
      entry({
        id: 'e4',
        status: 'unrecognized',
        serialNumber: 'SYN-ZZZ999ZZZ',
        equipmentUnitId: null,
        equipmentId: null,
        equipmentName: null,
        imageUrl: null,
      }),
    ],
  }

  it('shows the counts, the auditor and the note', async () => {
    vi.mocked(fetchInventoryAudit).mockResolvedValue(detail)
    renderReport()

    expect(await screen.findByText('Confirmed in stock')).toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('north shelf only')).toBeInTheDocument()
    // The tile shows its number and nothing else, so check the number is the
    // one from this audit rather than that the label rendered.
    expect(screen.getByText('Confirmed in stock').previousSibling).toHaveTextContent('1')
  })

  // The shortfall is what a report gets opened for, so it sorts to the top
  // ahead of the units that turned up.
  it('puts the findings above the settled rows', async () => {
    vi.mocked(fetchInventoryAudit).mockResolvedValue(detail)
    renderReport()

    const rows = within(await screen.findByRole('list')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Jetson Nano')
    expect(rows[0]).toHaveTextContent('Missing')
  })

  it('filters the report down to one kind of finding', async () => {
    vi.mocked(fetchInventoryAudit).mockResolvedValue(detail)
    renderReport()
    await screen.findByText('Confirmed in stock')

    await userEvent.click(screen.getByRole('button', { name: /^Flagged/ }))

    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('SYN-ZZZ999ZZZ')
    expect(rows[0]).toHaveTextContent('Not in inventory')
  })

  it('names who had a unit that was rightly off the shelf', async () => {
    vi.mocked(fetchInventoryAudit).mockResolvedValue(detail)
    renderReport()
    await screen.findByText('Confirmed in stock')

    await userEvent.click(screen.getByRole('button', { name: /^Checked out/ }))

    expect(screen.getByText(/out with Bob Reyes/)).toBeInTheDocument()
  })

  // The photos aren't in the audit tables — they're looked up live against
  // today's catalogue — so a report that renders them proves that lookup is
  // reaching the rows.
  it('shows each unit with its product photo', async () => {
    vi.mocked(fetchInventoryAudit).mockResolvedValue(detail)
    renderReport()
    await screen.findByText('Confirmed in stock')

    const photos = within(screen.getByRole('list')).getAllByRole('presentation', { hidden: true })
    expect(photos.length).toBeGreaterThan(0)
    expect(photos[0]).toHaveAttribute('src', 'https://example.test/muse.png')
  })

  it('says so when the audit cannot be loaded', async () => {
    vi.mocked(fetchInventoryAudit).mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderReport()

    expect(await screen.findByText(/Could not load this audit/)).toBeInTheDocument()
  })
})
