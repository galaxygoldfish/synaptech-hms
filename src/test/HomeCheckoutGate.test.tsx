import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchMemberLoans, peekMemberLoans, type MemberLoanGroup, type MemberLoanItem } from '../lib/memberLoans'
import Home from '../components/user-dashboard/Home'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/memberLoans', async () => {
  const actual = await vi.importActual<typeof import('../lib/memberLoans')>('../lib/memberLoans')
  return { ...actual, fetchMemberLoans: vi.fn(), peekMemberLoans: vi.fn() }
})

function loanGroup(returnDate: string): MemberLoanGroup {
  const primary: MemberLoanItem = {
    id: 'item-1',
    loanRequestId: 'req-1',
    equipmentId: 'eq-1',
    itemName: 'Muse 2',
    itemDescription: null,
    imageUrl: null,
    documentationUrl: null,
    isConsumable: false,
    itemRole: 'primary',
    serialNumber: 'SYN-HJXPP41T5',
    requestStatus: 'approved',
    requestedAt: '2026-09-01T00:00:00Z',
    reviewedAt: '2026-09-02T00:00:00Z',
    returnDate,
    returnRequestedAt: null,
    returnedAt: null,
    signedAgreementPath: null,
    cancellationReason: null,
  }
  return { loanRequestId: 'req-1', requestedAt: primary.requestedAt, primary, addOns: [] }
}

const notOverdue = [loanGroup('2099-01-01')]
const overdue = [loanGroup('2020-01-01')]

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'member-1', email: 'bob@uw.edu' } } as unknown as Session,
    profile: { id: 'member-1', first_name: 'Bob', last_name: 'Reyes', role: 'member', uw_email: 'bob@uw.edu', discord: 'bob', address: '1 Way' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(peekMemberLoans).mockReset().mockReturnValue(null)
  vi.mocked(fetchMemberLoans).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.mocked(console.error).mockRestore()
})

function renderHome() {
  const router = createMemoryRouter(
    [
      { path: '/home', element: <Home /> },
      { path: '/home/checkout', element: <p>Select hardware step</p> },
    ],
    { initialEntries: ['/home'] },
  )
  return render(<RouterProvider router={router} />)
}

function checkoutButton() {
  return screen.getByRole('button', { name: /check out\s*hardware|get hardware/i })
}

describe('Home checkout gate with a cached loan list', () => {
  // The case the gate exists for: the cached list says nothing is overdue,
  // but the fresh one (say, a loan that fell due since) says otherwise. A
  // click made in between must be decided on the fresh list.
  it('holds a click made before the fresh list lands and decides on the fresh list', async () => {
    vi.mocked(peekMemberLoans).mockReturnValue(notOverdue)
    let finishFresh: (groups: MemberLoanGroup[]) => void = () => {}
    vi.mocked(fetchMemberLoans).mockReturnValue(new Promise((resolve) => (finishFresh = resolve)))

    renderHome()
    // Usable straight away rather than greyed out while the refresh runs.
    expect(checkoutButton()).toBeEnabled()
    await userEvent.click(checkoutButton())
    expect(screen.queryByText('Select hardware step')).not.toBeInTheDocument()

    finishFresh(overdue)

    expect(await screen.findByText(/overdue/i, { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Select hardware step')).not.toBeInTheDocument()
  })

  it('goes to checkout once the fresh list confirms nothing is overdue', async () => {
    vi.mocked(peekMemberLoans).mockReturnValue(notOverdue)
    let finishFresh: (groups: MemberLoanGroup[]) => void = () => {}
    vi.mocked(fetchMemberLoans).mockReturnValue(new Promise((resolve) => (finishFresh = resolve)))

    renderHome()
    await userEvent.click(checkoutButton())
    finishFresh(notOverdue)

    expect(await screen.findByText('Select hardware step')).toBeInTheDocument()
  })

  // Previously the button stayed disabled forever in this case, with nothing
  // to say why.
  it('shows the error when the refresh fails, rather than deciding on the cached list', async () => {
    vi.mocked(peekMemberLoans).mockReturnValue(notOverdue)
    vi.mocked(fetchMemberLoans).mockRejectedValue(new Error('offline'))

    renderHome()

    expect(await screen.findByText("Couldn't load your hardware loans.")).toBeInTheDocument()
  })
})
