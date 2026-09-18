import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllLoanRequestItems, type AdminLoanRequestItemSummary } from '../lib/loanRequests'
import CheckoutPickLoan from '../components/admin-dashboard/checkout-hardware/CheckoutPickLoan'

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
    status: 'pending',
    requestedAt: '2026-09-14T17:30:00Z',
    returnDate: '2026-10-12',
    returnedAt: null,
    memberName: 'Bob Reyes',
    ...overrides,
  }
}

/** Waiting to be handed over — the only kind of row this screen shows. */
const waiting = loan()

/** Already handed over: approved and not yet back. */
const out = loan({
  id: 'item-2',
  itemName: 'Jetson Nano',
  serialNumber: 'SYN-QQ92KD10T',
  status: 'approved',
  memberName: 'Cleo Park',
})

/** Closed: came back weeks ago. */
const returned = loan({
  id: 'item-3',
  itemName: 'Oculus Quest 2',
  serialNumber: 'SYN-5OHTYJ2GX',
  status: 'approved',
  returnedAt: '2026-08-30T12:00:00Z',
  memberName: 'Dara Singh',
})

/** Turned down: never became a loan at all. */
const denied = loan({
  id: 'item-4',
  itemName: 'OpenBCI Mark IV',
  serialNumber: 'SYN-DD11EE22F',
  status: 'denied',
  memberName: 'Eli Moore',
})

beforeEach(() => {
  vi.mocked(fetchAllLoanRequestItems)
    .mockReset()
    .mockResolvedValue([waiting, out, returned, denied])
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

/** Reports the state step 2 was handed, which is what gates the agreement. */
function AgreementStub() {
  const location = useLocation()
  const state = location.state as { serialVerifiedBy?: string } | null
  return <p>{`Agreement for ${location.pathname} via ${state?.serialVerifiedBy ?? 'nothing'}`}</p>
}

function renderPicker() {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/checkout/pick', element: <CheckoutPickLoan /> },
      { path: '/adminHome/checkout/:id/agreement', element: <AgreementStub /> },
      { path: '/adminHome/checkout', element: <p>Scan a barcode</p> },
    ],
    { initialEntries: ['/adminHome/checkout/pick'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('CheckoutPickLoan', () => {
  // The whole reason this isn't the "Hardware loans" screen with a filter on
  // it: every row here has to be something a hand-off can be completed for.
  it('lists only the loans that are waiting to be handed over', async () => {
    renderPicker()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.queryByText('Jetson Nano')).not.toBeInTheDocument()
    expect(screen.queryByText('Oculus Quest 2')).not.toBeInTheDocument()
    expect(screen.queryByText('OpenBCI Mark IV')).not.toBeInTheDocument()
  })

  it('is a plain list — nothing to search or filter before picking', async () => {
    renderPicker()
    await screen.findByText('Muse 2')

    expect(screen.getByRole('heading', { name: 'Pick a loan request' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows who each loan is for and when it was asked for', async () => {
    renderPicker()

    expect(await screen.findByText('Bob Reyes')).toBeInTheDocument()
    expect(screen.getByText('SYN-HJXPP41T5')).toBeInTheDocument()
    expect(screen.getByText('Requested on Sep 14 2026')).toBeInTheDocument()
  })

  // Half the reason the picker exists: an item with no serial can't be
  // scanned or typed, so this is the only route to it.
  it('lists a requested item that never had a serial assigned, and says so', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([loan({ serialNumber: null })])

    renderPicker()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.getByText('No serial assigned')).toBeInTheDocument()
  })

  it('goes to that loan\'s agreement when a row is picked', async () => {
    renderPicker()

    await userEvent.click(await screen.findByRole('button', { name: /hand over Muse 2 to Bob Reyes/i }))

    // Picking deliberately off this list is itself the verification the
    // agreement step demands — there is no barcode to check.
    expect(
      await screen.findByText('Agreement for /adminHome/checkout/item-1/agreement via database'),
    ).toBeInTheDocument()
  })

  it('says so when every request has already been handed over', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([out, returned])

    renderPicker()

    expect(
      await screen.findByText(/no hardware is waiting to be handed over/i),
    ).toBeInTheDocument()
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
