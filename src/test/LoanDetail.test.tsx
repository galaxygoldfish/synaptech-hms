import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchAllLoanRequestItems,
  fetchLoanRequestItemDetail,
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
    signatureName: 'Bob Reyes',
    signatureDate: '2026-09-08',
    reviewedAt: null,
    reviewNote: null,
    returnRequestedAt: null,
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
const bundledRequest = detail({
  otherItems: [
    { id: 'item-2', itemName: 'Oculus VR', imageUrl: 'https://example.test/oculus.png', itemRole: 'optional_addon' },
  ],
})

const siblingItem = detail({
  id: 'item-2',
  itemName: 'Oculus VR',
  serialNumber: 'SYN-VR9087',
  itemRole: 'optional_addon',
  // No photo on this one — the row still has to line up with the others.
  otherItems: [{ id: 'item-1', itemName: 'Muse 2', imageUrl: null, itemRole: 'primary' }],
})

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
  it('offers the checkout availability on a pending request', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(detail())

    renderDetail()

    expect(await screen.findByText('Checkout requested')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view checkout availability/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download hardware loan agreement/i })).toBeInTheDocument()
  })

  // Availability is captured for a meeting that hasn't happened yet, so it's
  // offered while one is pending and not once the hardware has changed hands.
  it('drops the availability once the hardware is out', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(activeLoan)

    renderDetail()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /availability/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download hardware loan agreement/i })).toBeInTheDocument()
  })

  // Hand-offs and returns are handled from the admin home flows, not here.
  it('has no hand-off or return buttons in any state', async () => {
    for (const loan of [detail(), activeLoan, overdueLoan]) {
      vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(loan)
      const { unmount } = renderDetail()
      await screen.findByRole('heading', { name: 'Loan details' })
      await screen.findByText(loan.itemName)
      expect(screen.queryByRole('button', { name: 'Mark as handed off' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Mark as returned' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('marks an overdue loan as overdue', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(overdueLoan)

    renderDetail()

    expect(await screen.findByText('Overdue')).toBeInTheDocument()
  })

  it('says when a returned loan came back and who received it', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(returnedLoan)

    renderDetail()

    expect(await screen.findByText('Returned')).toBeInTheDocument()
    expect(screen.getByText('Received by')).toBeInTheDocument()
    // Nothing left to move, either way.
    expect(screen.queryByRole('button', { name: /^Mark as/ })).not.toBeInTheDocument()
  })

  // Denied requests are kept out of the list and the stat cards, so this is
  // only reachable by URL — but it's a real record, and rendering nothing at
  // all reads as a broken page.
  it('still renders a denied request rather than an empty screen', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(deniedRequest)

    renderDetail()

    expect(await screen.findByText('Denied')).toBeInTheDocument()
    expect(screen.getByText('Already on loan.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Mark as/ })).not.toBeInTheDocument()
  })

  it('offers no agreement to download when none is on file', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(detail({ signedAgreementPath: null }))

    renderDetail()

    expect(await screen.findByText('Checkout requested')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download hardware loan agreement/i })).not.toBeInTheDocument()
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
        returnRequestedAt: null,
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
        returnRequestedAt: null,
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
        returnRequestedAt: null,
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
        returnRequestedAt: null,
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
        returnRequestedAt: null,
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

// Each item bundled into one checkout is a loan in its own right — its own
// serial, return date and hand-off — so the siblings list is a way into
// them, not a read-only footnote.
describe('LoanDetail — the other items in a request', () => {
  it('opens a sibling item as its own loan', async () => {
    vi.mocked(fetchLoanRequestItemDetail)
      .mockResolvedValueOnce(bundledRequest)
      .mockResolvedValueOnce(siblingItem)

    renderDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'View loan details for Oculus VR' }))

    expect(await screen.findByText('Oculus VR')).toBeInTheDocument()
    expect(fetchLoanRequestItemDetail).toHaveBeenLastCalledWith('item-2')
    // The screen stays mounted across the route change, so the whole record
    // has to swap — including the way back to the item just left.
    expect(screen.getByText('SYN-VR9087')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View loan details for Muse 2' })).toBeInTheDocument()
  })

  it('shows each sibling\'s product photo, and a placeholder for one without', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue(
      detail({
        otherItems: [
          { id: 'item-2', itemName: 'Oculus VR', imageUrl: 'https://example.test/oculus.png', itemRole: 'optional_addon' },
          { id: 'item-3', itemName: 'USB-C cable', imageUrl: null, itemRole: 'required_addon' },
        ],
      }),
    )

    renderDetail()
    const withPhoto = await screen.findByRole('button', { name: 'View loan details for Oculus VR' })

    // Decorative: the row already names the item, so the photo repeating it
    // would just be something extra to listen through.
    const image = within(withPhoto).getByRole('presentation', { hidden: true })
    expect(image).toHaveAttribute('src', 'https://example.test/oculus.png')

    // The row without a photo keeps the same slot, so the names stay in line.
    const withoutPhoto = screen.getByRole('button', { name: 'View loan details for USB-C cable' })
    expect(within(withoutPhoto).queryByRole('presentation', { hidden: true })).not.toBeInTheDocument()
    expect(within(withoutPhoto).getByText('USB-C cable')).toBeInTheDocument()
  })

})
