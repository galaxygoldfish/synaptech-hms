import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllLoanRequestItems, type AdminLoanRequestItemSummary } from '../lib/loanRequests'
import ReturnPickLoan from '../components/admin-dashboard/return-hardware/ReturnPickLoan'

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

/** Out and not yet due. */
const active = loan()

/** Out and late — still hardware someone can walk up and hand back. */
const overdue = loan({
  id: 'item-2',
  itemName: 'Jetson Nano',
  serialNumber: 'SYN-QQ92KD10T',
  returnDate: '2020-01-01',
  memberName: 'Cleo Park',
})

/** Requested but never collected: nothing to hand back. */
const neverCollected = loan({
  id: 'item-3',
  itemName: 'Oculus Quest 2',
  serialNumber: 'SYN-5OHTYJ2GX',
  status: 'pending',
  memberName: 'Dara Singh',
})

/** Already back on the shelf. */
const backAlready = loan({
  id: 'item-4',
  itemName: 'OpenBCI Mark IV',
  serialNumber: 'SYN-DD11EE22F',
  returnRequestedAt: null,
  returnedAt: '2026-08-30T12:00:00Z',
  memberName: 'Eli Moore',
})

beforeEach(() => {
  vi.mocked(fetchAllLoanRequestItems)
    .mockReset()
    .mockResolvedValue([active, overdue, neverCollected, backAlready])
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

function ConfirmStub() {
  const location = useLocation()
  const state = location.state as { serialVerifiedBy?: string } | null
  return <p>{`Confirm ${location.pathname} via ${state?.serialVerifiedBy ?? 'nothing'}`}</p>
}

function renderPicker() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/return/pick', element: <ReturnPickLoan /> },
      { path: '/adminHome/return/:id/confirm', element: <ConfirmStub /> },
      { path: '/adminHome/return', element: <p>Scan a barcode</p> },
    ],
    { initialEntries: ['/adminHome/return/pick'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('ReturnPickLoan', () => {
  // Only hardware that is actually in somebody's hands can be handed back.
  it('lists everything currently out, due and overdue alike', async () => {
    renderPicker()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.getByText('Jetson Nano')).toBeInTheDocument()
    expect(screen.queryByText('Oculus Quest 2')).not.toBeInTheDocument()
    expect(screen.queryByText('OpenBCI Mark IV')).not.toBeInTheDocument()
  })

  // The due date, not the request date: for hardware being handed back it's
  // the number that says whether this is late.
  it('reports each loan by when it is due back', async () => {
    renderPicker()

    expect(await screen.findByText('Due back Oct 12 2099')).toBeInTheDocument()
    expect(screen.getByText('Due back Jan 1 2020')).toBeInTheDocument()
  })

  it('is a plain list — nothing to search or filter before picking', async () => {
    renderPicker()
    await screen.findByText('Muse 2')

    expect(screen.getByRole('heading', { name: 'Pick a loan to return' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('goes to that loan\'s confirmation when a row is picked', async () => {
    renderPicker()

    await userEvent.click(
      await screen.findByRole('button', { name: /take back Muse 2 from Bob Reyes/i }),
    )

    expect(
      await screen.findByText('Confirm /adminHome/return/item-1/confirm via database'),
    ).toBeInTheDocument()
  })

  it('says so when nothing is out on loan', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([neverCollected, backAlready])

    renderPicker()

    expect(await screen.findByText(/no hardware is out on loan/i)).toBeInTheDocument()
  })

  it('goes back to the scan step', async () => {
    renderPicker()

    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    expect(await screen.findByText('Scan a barcode')).toBeInTheDocument()
  })

  it('says so when the loans cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchAllLoanRequestItems).mockRejectedValue(new Error('offline'))

    renderPicker()

    expect(await screen.findByText(/could not load hardware loans/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
