import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllProfiles, peekAllProfiles } from '../lib/members'
import { fetchLoanRequestItemDetail, type AdminLoanRequestDetail } from '../lib/loanRequests'
import { fetchAvailability, peekAvailability } from '../lib/availability'
import { stash } from '../lib/queryCache'
import { loanDetailKey } from '../lib/detailKeys'
import ViewMembers from '../components/admin-dashboard/ViewMembers'
import LoanDetail from '../components/admin-dashboard/LoanDetail'
import { EditAvailabilityModal } from '../components/user-dashboard/EditAvailabilityModal'
import type { Profile } from '../types/index'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/members', async () => {
  const actual = await vi.importActual<typeof import('../lib/members')>('../lib/members')
  return { ...actual, fetchAllProfiles: vi.fn(), peekAllProfiles: vi.fn() }
})

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return { ...actual, fetchLoanRequestItemDetail: vi.fn() }
})

vi.mock('../lib/availability', async () => {
  const actual = await vi.importActual<typeof import('../lib/availability')>('../lib/availability')
  return { ...actual, fetchAvailability: vi.fn(), peekAvailability: vi.fn() }
})

const bob: Profile = {
  id: 'member-1',
  first_name: 'Bob',
  last_name: 'Reyes',
  phone: '2065550000',
  student_id: '1234567',
  uw_email: 'bob@uw.edu',
  address: '1 Way',
  discord: 'bob',
  role: 'member',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}

const detail = {
  id: 'item-1',
  loanRequestId: 'req-1',
  equipmentId: 'eq-1',
  itemName: 'Muse 2',
  itemDescription: null,
  imageUrl: null,
  serialNumber: 'SYN-HJXPP41T5',
  itemRole: 'primary',
  status: 'approved',
  requestedAt: '2026-09-14T17:30:00Z',
  returnDate: '2099-10-12',
  signedAgreementPath: null,
  signatureName: null,
  signatureDate: null,
  reviewedAt: '2026-09-15T17:30:00Z',
  reviewNote: null,
  returnRequestedAt: null,
  returnedAt: null,
  returnedByName: null,
  memberId: 'member-1',
  memberName: 'Bob Reyes',
  memberEmail: 'bob@uw.edu',
  memberDiscord: null,
  reviewerName: 'Ada Admin',
  otherItems: [],
} as AdminLoanRequestDetail

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'admin-1', email: 'ada@uw.edu' } } as unknown as Session,
    profile: { ...bob, id: 'admin-1', first_name: 'Ada', last_name: 'Admin', role: 'admin' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(fetchAllProfiles).mockReset().mockResolvedValue([bob])
  vi.mocked(peekAllProfiles).mockReset().mockReturnValue(null)
  vi.mocked(fetchLoanRequestItemDetail).mockReset().mockResolvedValue(detail)
  vi.mocked(fetchAvailability).mockReset().mockResolvedValue([])
  vi.mocked(peekAvailability).mockReset().mockReturnValue(null)
})

function renderAt(path: string, routes: { path: string; element: React.ReactNode }[]) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('no loading skeleton when the data is already known', () => {
  it('draws a list from its last-loaded copy on the first render, then refreshes it', async () => {
    vi.mocked(peekAllProfiles).mockReturnValue([bob])

    renderAt('/adminHome/members', [{ path: '/adminHome/members', element: <ViewMembers /> }])

    expect(screen.getByText('Bob Reyes')).toBeInTheDocument()
    await waitFor(() => expect(fetchAllProfiles).toHaveBeenCalled())
  })

  it('draws a detail screen from the data its list stashed, without fetching again', () => {
    stash(loanDetailKey('item-1'), detail)

    renderAt('/adminHome/loans/item-1', [{ path: '/adminHome/loans/:id', element: <LoanDetail /> }])

    expect(screen.getByText('SYN-HJXPP41T5')).toBeInTheDocument()
    expect(fetchLoanRequestItemDetail).not.toHaveBeenCalled()
  })

  it('still loads a detail screen opened directly', async () => {
    renderAt('/adminHome/loans/item-1', [{ path: '/adminHome/loans/:id', element: <LoanDetail /> }])

    expect(await screen.findByText('SYN-HJXPP41T5')).toBeInTheDocument()
    expect(fetchLoanRequestItemDetail).toHaveBeenCalledWith('item-1')
  })
})

describe('EditAvailabilityModal with warmed hours', () => {
  const target = { kind: 'checkout' as const, loanRequestId: 'req-1' }

  // Painted from the warmed copy, and the member starts changing them before
  // the refresh lands: the refresh must not undo what they did.
  it('never overwrites hours the member has started changing', async () => {
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    vi.mocked(peekAvailability).mockReturnValue([])
    let finish: (slots: { date: string; hour: number }[]) => void = () => {}
    vi.mocked(fetchAvailability).mockReturnValue(new Promise((resolve) => (finish = resolve)))

    render(<EditAvailabilityModal target={target} onClose={() => {}} />)

    const cells = screen.getAllByRole('button', { pressed: false })
    await userEvent.click(cells[0])
    finish([{ date: iso, hour: 12 }])

    await waitFor(() => expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1))
    expect(cells[0]).toHaveAttribute('aria-pressed', 'true')
  })
})
