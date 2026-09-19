import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllLoanRequestItems, type AdminLoanRequestItemSummary } from '../lib/loanRequests'
import HardwareLoans from '../components/admin-dashboard/HardwareLoans'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return { ...actual, fetchAllLoanRequestItems: vi.fn() }
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

/** A member waiting to be handed hardware. */
const checkoutRequest = loan({
  id: 'item-1',
  itemName: 'Muse 2',
  status: 'pending',
  memberName: 'Bob Reyes',
})

const active = loan({ id: 'item-2', itemName: 'Jetson Nano', memberName: 'Cleo Park' })

const overdue = loan({
  id: 'item-3',
  itemName: 'Oculus Quest 2',
  returnDate: '2020-01-01',
  memberName: 'Dara Singh',
})

const returned = loan({
  id: 'item-4',
  itemName: 'OpenBCI Mark IV',
  returnRequestedAt: null,
  returnedAt: '2026-08-30T12:00:00Z',
  memberName: 'Eli Moore',
})

beforeEach(() => {
  vi.mocked(fetchAllLoanRequestItems)
    .mockReset()
    .mockResolvedValue([checkoutRequest, active, overdue, returned])
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

function renderLoans(initialEntry = '/adminHome/loans') {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/loans', element: <HardwareLoans /> },
      { path: '/adminHome/loans/:id', element: <p>Loan detail</p> },
      { path: '/adminHome', element: <p>Admin dashboard</p> },
    ],
    { initialEntries: [initialEntry] },
  )
  return render(<RouterProvider router={router} />)
}

describe('HardwareLoans filters', () => {
  // Checkout requests and return requests are the same thing to an admin
  // working this screen: a member waiting on them.
  it('offers one Requests chip, not one per kind of request', async () => {
    renderLoans()
    await screen.findByText('Muse 2')

    expect(screen.getByRole('button', { name: 'Requests' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Returns' })).not.toBeInTheDocument()
    // Returned is a different thing — a closed loan, not a waiting one.
    expect(screen.getByRole('button', { name: 'Returned' })).toBeInTheDocument()
  })

  it('shows checkout requests under Requests', async () => {
    renderLoans()
    await screen.findByText('Muse 2')

    await userEvent.click(screen.getByRole('button', { name: 'Requests' }))

    expect(screen.getByText('Muse 2')).toBeInTheDocument()
    // The row carries its badge twice — once for the desktop column, once
    // inline beside the name below 1200px — and CSS shows exactly one.
    // jsdom applies no CSS, so both are in the tree here.
    expect(screen.getAllByText('Checkout requested')).not.toHaveLength(0)
    expect(screen.queryByText('Jetson Nano')).not.toBeInTheDocument()
    expect(screen.queryByText('OpenBCI Mark IV')).not.toBeInTheDocument()
  })

  // Which kind of request a row is stays on its badge, so merging the chips
  // loses nothing.
  it('keeps the two kinds of request told apart on the rows themselves', async () => {
    renderLoans()
    await screen.findByText('Muse 2')

    await userEvent.click(screen.getByRole('button', { name: 'Requests' }))
    expect(screen.getAllByText('Checkout requested')).not.toHaveLength(0)
  })

  it('still filters the other chips to their own bucket', async () => {
    renderLoans()
    await screen.findByText('Muse 2')

    await userEvent.click(screen.getByRole('button', { name: 'Overdue' }))
    expect(screen.getByText('Oculus Quest 2')).toBeInTheDocument()
    expect(screen.queryByText('Jetson Nano')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Returned' }))
    expect(screen.getByText('OpenBCI Mark IV')).toBeInTheDocument()
    expect(screen.queryByText('Oculus Quest 2')).not.toBeInTheDocument()
  })

  it('lists everything under All', async () => {
    renderLoans()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.getByText('Jetson Nano')).toBeInTheDocument()
    expect(screen.getByText('Oculus Quest 2')).toBeInTheDocument()
    expect(screen.getByText('OpenBCI Mark IV')).toBeInTheDocument()
  })

  // The dashboard's "Pending returns" card still links with the old value,
  // and so may a bookmark.
  it('lands a ?filter=returns link on the merged Requests chip', async () => {
    renderLoans('/adminHome/loans?filter=returns')
    await screen.findByText('Muse 2')

    expect(screen.getByRole('button', { name: 'Requests' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Jetson Nano')).not.toBeInTheDocument()
  })

  it('opens on the chip a ?filter= link names', async () => {
    renderLoans('/adminHome/loans?filter=overdue')

    expect(await screen.findByText('Oculus Quest 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says what is missing when a chip has nothing under it', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([active])

    renderLoans()
    await screen.findByText('Jetson Nano')
    await userEvent.click(screen.getByRole('button', { name: 'Requests' }))

    expect(screen.getByText('There are no requests waiting on an admin')).toBeInTheDocument()
  })
})
