import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchAllLoanRequestItems,
  fetchLoanRequestItemDetail,
  handOffLoanRequestItem,
  markLoanRequestItemReturned,
  type AdminLoanRequestDetail,
} from '../lib/loanRequests'
import LoanDetail from '../components/admin-dashboard/LoanDetail'
import HardwareLoans from '../components/admin-dashboard/HardwareLoans'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

// bucketForLoanItem stays real: which action a loan offers is derived from
// it, so stubbing it would test the mock rather than the screen.
vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return {
    ...actual,
    fetchAllLoanRequestItems: vi.fn(),
    fetchLoanRequestItemDetail: vi.fn(),
    fetchLoanRequestAvailability: vi.fn().mockResolvedValue([]),
    fetchSignedAgreementUrl: vi.fn(),
    handOffLoanRequestItem: vi.fn(),
    markLoanRequestItemReturned: vi.fn(),
  }
})

const mockSession = { user: { id: 'admin-1', email: 'admin@uw.edu' } } as unknown as Session

const mockProfile = {
  id: 'admin-1',
  first_name: 'Ada',
  last_name: 'Admin',
  role: 'admin' as const,
  uw_email: 'admin@uw.edu',
  discord: 'ada#0001',
  address: '123 Way',
}

function detail(overrides: Partial<AdminLoanRequestDetail> = {}): AdminLoanRequestDetail {
  return {
    id: 'item-1',
    loanRequestId: 'req-1',
    equipmentId: 'eq-1',
    itemName: 'Muse 2',
    itemDescription: null,
    imageUrl: null,
    serialNumber: 'SYN-ABC123XYZ',
    itemRole: 'primary',
    status: 'pending',
    requestedAt: '2026-09-08T17:30:00Z',
    returnDate: null,
    signedAgreementPath: 'bob/req-1/eq-1.pdf',
    reviewedAt: null,
    reviewNote: null,
    returnedAt: null,
    returnedByName: null,
    memberId: 'member-1',
    memberName: 'Bob Reyes',
    memberEmail: 'bob@uw.edu',
    memberDiscord: 'bobreyes#2201',
    reviewerName: null,
    otherItems: [],
    ...overrides,
  }
}

const activeLoan = detail({ status: 'approved', returnDate: '2099-10-08', reviewedAt: '2026-09-10T18:00:00Z' })
const overdueLoan = detail({ status: 'approved', returnDate: '2020-01-01', reviewedAt: '2019-12-01T18:00:00Z' })
const returnedLoan = detail({
  status: 'approved',
  returnDate: '2026-09-01',
  reviewedAt: '2026-08-10T18:00:00Z',
  returnedAt: '2026-09-14T22:15:00Z',
  returnedByName: 'Ada Admin',
})
const deniedRequest = detail({ status: 'denied', reviewNote: 'Already on loan.' })

beforeEach(() => {
  vi.mocked(fetchLoanRequestItemDetail).mockReset()
  vi.mocked(fetchAllLoanRequestItems).mockReset()
  vi.mocked(handOffLoanRequestItem).mockReset().mockResolvedValue(undefined)
  vi.mocked(markLoanRequestItemReturned).mockReset().mockResolvedValue(undefined)
  vi.mocked(useAuth).mockReturnValue({
    session: mockSession,
    profile: mockProfile,
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function renderDetail() {
  const router = createMemoryRouter([{ path: '/adminHome/loans/:id', element: <LoanDetail /> }], {
    initialEntries: ['/adminHome/loans/item-1'],
  })
  return render(<RouterProvider router={router} />)
}

describe('LoanDetail — what each state offers', () => {
  it('offers the hand-off on a pending checkout request, with the checkout availability', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(detail())

    renderDetail()

    expect(await screen.findByRole('button', { name: 'Mark as handed off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view checkout availability/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as returned' })).not.toBeInTheDocument()
  })

  it('offers the return on an active loan', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(activeLoan)

    renderDetail()

    expect(await screen.findByRole('button', { name: 'Mark as returned' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as handed off' })).not.toBeInTheDocument()
  })

  it('offers the return on an overdue loan too — it still has to come back', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(overdueLoan)

    renderDetail()

    expect(await screen.findByText('Overdue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as returned' })).toBeInTheDocument()
  })

  it('offers nothing on a returned loan, and says who received it', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(returnedLoan)

    renderDetail()

    expect(await screen.findByText('Returned')).toBeInTheDocument()
    expect(screen.getByText('Received by')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as returned' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as handed off' })).not.toBeInTheDocument()
  })

  // Denied requests are kept out of the list and the stat cards, so this is
  // only reachable by URL — but it's a real record, and rendering nothing at
  // all reads as a broken page.
  it('still renders a denied request rather than an empty screen', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(deniedRequest)

    renderDetail()

    expect(await screen.findByText('Denied')).toBeInTheDocument()
    expect(screen.getByText('Already on loan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as handed off' })).not.toBeInTheDocument()
  })

  it('blocks the hand-off, with a reason, when no signed agreement is on file', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(detail({ signedAgreementPath: null }))

    renderDetail()

    expect(await screen.findByRole('button', { name: 'Mark as handed off' })).toBeDisabled()
    expect(screen.getByText(/no signed agreement on file/i)).toBeInTheDocument()
  })
})

describe('LoanDetail — confirming an action', () => {
  it('names the exact serial before handing hardware over', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(detail())

    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as handed off' }))

    // Several units of one product are indistinguishable on the shelf, so the
    // serial is the thing the admin is being asked to check.
    const dialog = within(screen.getByRole('dialog', { name: /hand off this hardware/i }))
    expect(dialog.getByText(/SYN-ABC123XYZ/)).toBeInTheDocument()
    expect(dialog.getByText(/exact unit you are handing to Bob Reyes/i)).toBeInTheDocument()
    expect(handOffLoanRequestItem).not.toHaveBeenCalled()
  })

  it('records the hand-off only after the dialog is confirmed, then re-reads the loan', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValueOnce(detail()).mockResolvedValueOnce(activeLoan)

    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as handed off' }))
    const handOffDialog = within(screen.getByRole('dialog', { name: /hand off this hardware/i }))
    await userEvent.click(handOffDialog.getByRole('button', { name: 'Mark as handed off' }))

    await waitFor(() => expect(handOffLoanRequestItem).toHaveBeenCalledWith({
      itemId: 'item-1',
      adminId: 'admin-1',
      adminName: 'Ada Admin',
    }))
    expect(await screen.findByRole('button', { name: 'Mark as returned' })).toBeInTheDocument()
  })

  it('does nothing when the hand-off dialog is cancelled', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(detail())

    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as handed off' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(handOffLoanRequestItem).not.toHaveBeenCalled()
    expect(screen.queryByText(/exact unit you are handing/i)).not.toBeInTheDocument()
  })

  it('names the serial before checking hardware back in, and records the return on confirm', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValueOnce(activeLoan).mockResolvedValueOnce(returnedLoan)

    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as returned' }))
    const returnDialog = within(screen.getByRole('dialog', { name: /check this hardware back in/i }))
    expect(returnDialog.getByText(/SYN-ABC123XYZ/)).toBeInTheDocument()

    await userEvent.click(returnDialog.getByRole('button', { name: 'Mark as returned' }))

    await waitFor(() => expect(markLoanRequestItemReturned).toHaveBeenCalledWith('item-1', 'admin-1'))
    expect(await screen.findByText('Returned')).toBeInTheDocument()
  })

  it('surfaces a failure instead of pretending the loan changed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(activeLoan)
    vi.mocked(markLoanRequestItemReturned).mockRejectedValue(new Error('offline'))

    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as returned' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as returned' }),
    )

    expect(await screen.findByText(/could not record the return/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })
})

// The bug this screen was built to fix: every row in the list used to be
// disabled except pending requests, and those jumped straight into the
// barcode checkout flow instead of opening the loan.
describe('HardwareLoans — opening a loan', () => {
  function renderList() {
    const router = createMemoryRouter(
      [
        { path: '/adminHome/loans', element: <HardwareLoans /> },
        { path: '/adminHome/loans/:id', element: <LoanDetail /> },
      ],
      { initialEntries: ['/adminHome/loans'] },
    )
    return render(<RouterProvider router={router} />)
  }

  it('opens the loan detail screen for an active loan, not just a pending request', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([
      {
        id: 'item-1',
        equipmentId: 'eq-1',
        itemName: 'Muse 2',
        imageUrl: null,
        serialNumber: 'SYN-ABC123XYZ',
        status: 'approved',
        requestedAt: '2026-09-08T17:30:00Z',
        returnDate: '2099-10-08',
        returnedAt: null,
        memberName: 'Bob Reyes',
      },
    ])
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(activeLoan)

    renderList()
    await userEvent.click(await screen.findByRole('button', { name: /view loan details for Muse 2/i }))

    expect(await screen.findByRole('heading', { name: 'Loan details' })).toBeInTheDocument()
    expect(fetchLoanRequestItemDetail).toHaveBeenCalledWith('item-1')
  })

  it('shows a returned loan under its own filter with the date it came back', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([
      {
        id: 'item-1',
        equipmentId: 'eq-1',
        itemName: 'Muse 2',
        imageUrl: null,
        serialNumber: 'SYN-ABC123XYZ',
        status: 'approved',
        requestedAt: '2026-09-08T17:30:00Z',
        returnDate: '2026-09-01',
        returnedAt: '2026-09-14T22:15:00Z',
        memberName: 'Bob Reyes',
      },
    ])

    renderList()
    await userEvent.click(await screen.findByRole('button', { name: 'Returned' }))

    const row = screen.getByRole('button', { name: /view loan details for Muse 2/i })
    expect(within(row).getByText('Returned')).toBeInTheDocument()
    expect(within(row).getByText(/Returned on/)).toBeInTheDocument()
  })

  it('filters the list by item, serial or member as the admin types', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([
      {
        id: '1',
        equipmentId: 'eq-1',
        itemName: 'Muse 2',
        imageUrl: null,
        serialNumber: 'SYN-ABC123XYZ',
        status: 'approved',
        requestedAt: '2026-09-08T17:30:00Z',
        returnDate: '2099-10-08',
        returnedAt: null,
        memberName: 'Bob Reyes',
      },
      {
        id: '2',
        equipmentId: 'eq-2',
        itemName: 'OpenBCI Mark IV',
        imageUrl: null,
        serialNumber: 'SYN-QQ4410',
        status: 'approved',
        requestedAt: '2026-09-08T17:30:00Z',
        returnDate: '2099-10-08',
        returnedAt: null,
        memberName: 'Priya Raman',
      },
    ])

    renderList()
    await screen.findByRole('button', { name: /view loan details for Muse 2/i })

    const search = screen.getByRole('textbox', { name: /search by item, serial or member/i })

    // The serial is the one an admin has in front of them, off the label.
    await userEvent.type(search, 'qq4410')
    expect(screen.getByRole('button', { name: /OpenBCI Mark IV/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view loan details for Muse 2/i })).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, 'priya')
    expect(screen.getByRole('button', { name: /OpenBCI Mark IV/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view loan details for Muse 2/i })).not.toBeInTheDocument()
  })

  // "There are no overdue hardware loans" would be a lie when the filter has
  // matches and the search is what emptied the list.
  it('blames the search, not the filter, when a search matches nothing', async () => {
    vi.mocked(fetchAllLoanRequestItems).mockResolvedValue([
      {
        id: '1',
        equipmentId: 'eq-1',
        itemName: 'Muse 2',
        imageUrl: null,
        serialNumber: 'SYN-ABC123XYZ',
        status: 'approved',
        requestedAt: '2026-09-08T17:30:00Z',
        returnDate: '2099-10-08',
        returnedAt: null,
        memberName: 'Bob Reyes',
      },
    ])

    renderList()
    await userEvent.type(
      await screen.findByRole('textbox', { name: /search by item, serial or member/i }),
      'nothing matches this',
    )

    expect(screen.getByText('No hardware loans match your search')).toBeInTheDocument()
  })
})
