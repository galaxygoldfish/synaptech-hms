import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchMemberLoans, type MemberLoanGroup, type MemberLoanItem } from '../lib/memberLoans'
import MyHardwareLoans from '../components/user-dashboard/MyHardwareLoans'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

// memberLoanState stays real: which badge and which button a row offers is
// derived from it, so stubbing it would test the mock rather than the screen.
vi.mock('../lib/memberLoans', async () => {
  const actual = await vi.importActual<typeof import('../lib/memberLoans')>('../lib/memberLoans')
  return { ...actual, fetchMemberLoans: vi.fn() }
})

const mockSession = { user: { id: 'member-1', email: 'bob@uw.edu' } } as unknown as Session

const memberProfile = {
  id: 'member-1',
  first_name: 'Bob',
  last_name: 'Reyes',
  role: 'member' as const,
  uw_email: 'bob@uw.edu',
  discord: 'bobreyes',
  address: '123 Way',
}

function item(overrides: Partial<MemberLoanItem> = {}): MemberLoanItem {
  return {
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
    requestedAt: '2026-06-23T17:30:00Z',
    reviewedAt: '2026-06-23T18:00:00Z',
    returnDate: '2099-09-01',
    returnRequestedAt: null,
    returnedAt: null,
    signedAgreementPath: 'member/req-1/eq-1.pdf',
    ...overrides,
  }
}

function group(primary: MemberLoanItem, addOns: MemberLoanItem[] = []): MemberLoanGroup {
  return { loanRequestId: primary.loanRequestId, requestedAt: primary.requestedAt, primary, addOns }
}

beforeEach(() => {
  vi.mocked(fetchMemberLoans).mockReset().mockResolvedValue([])
  vi.mocked(useAuth).mockReturnValue({
    session: mockSession,
    profile: memberProfile,
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function renderLoans() {
  const router = createMemoryRouter(
    [
      { path: '/home/loans', element: <MyHardwareLoans /> },
      { path: '/home/loans/:id', element: <p>Loan detail</p> },
      { path: '/home', element: <p>Member dashboard</p> },
    ],
    { initialEntries: ['/home/loans'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('MyHardwareLoans', () => {
  it('heads the page and offers a search over the loans', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([group(item())])
    renderLoans()

    expect(await screen.findByRole('heading', { name: 'My hardware loans' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search your hardware loans')).toBeInTheDocument()
  })

  // The stylesheet lays the row out as [name + dates] · badges · actions,
  // which only works if the badges are a sibling of the info column rather
  // than inside it. Nesting them still "renders", it just silently collapses
  // the row's layout — so the relationship is pinned here.
  it('puts the badges beside the name, not inside its column', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([group(item())])
    renderLoans()

    const badge = await screen.findByText('Active')
    expect(badge.closest('[class*="loanInfo"]')).toBeNull()
    expect(screen.getByText('Checked out on June 23rd, 2026').closest('[class*="loanInfo"]')).not.toBeNull()
  })

  // ── The states a row can be in ──────────────────────────────

  it('shows a checkout request without dates it does not have yet', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([group(item({ requestStatus: 'pending' }))])
    renderLoans()

    expect(await screen.findByText('Checkout requested on 6.23.26')).toBeInTheDocument()
    expect(screen.queryByText(/Checked out on/)).not.toBeInTheDocument()
  })

  it('shows an active loan with both its dates', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([group(item())])
    renderLoans()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Checked out on June 23rd, 2026')).toBeInTheDocument()
    expect(screen.getByText('Return by September 1st, 2099')).toBeInTheDocument()
  })

  it('warns when the return date is close', async () => {
    const due = new Date()
    due.setDate(due.getDate() + 3)
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ returnDate: due.toISOString().slice(0, 10) })),
    ])
    renderLoans()

    expect(await screen.findByText('Return soon!')).toBeInTheDocument()
  })

  it('says what is at stake on an overdue loan', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([group(item({ returnDate: '2020-01-01' }))])
    renderLoans()

    expect(
      await screen.findByText('Overdue - disciplinary action may be pursued'),
    ).toBeInTheDocument()
  })

  it('shows a raised return request as waiting on the club', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ returnRequestedAt: '2026-09-10T10:00:00Z' })),
    ])
    renderLoans()

    expect(await screen.findByText('Processing return request')).toBeInTheDocument()
  })

  it('closes out a returned loan with the date it came back', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ returnedAt: '2026-09-02T14:00:00Z' })),
    ])
    renderLoans()

    expect(await screen.findByText('Returned')).toBeInTheDocument()
    expect(screen.getByText('Returned on September 2nd, 2026')).toBeInTheDocument()
  })

  // ── Add-ons ────────────────────────────────────────────────

  it('indents an add-on under the item it came with, badged as one', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ itemName: 'TENS 3000' }), [
        item({
          id: 'item-2',
          itemName: 'TENS Electrodes 4-pack',
          itemRole: 'optional_addon',
          isConsumable: true,
          serialNumber: null,
          returnDate: null,
        }),
      ]),
    ])
    renderLoans()

    expect(await screen.findByText('TENS 3000')).toBeInTheDocument()
    expect(screen.getByText('TENS Electrodes 4-pack')).toBeInTheDocument()
    expect(screen.getByText('ADD-ON')).toBeInTheDocument()
    expect(screen.getByText('Consumable')).toBeInTheDocument()
    // Kept, not borrowed — so there is nothing for it to be due.
    expect(screen.getByText('Return not required')).toBeInTheDocument()
  })

  // A consumable is kept rather than borrowed, so there is no loan to open.
  it('gives a consumable add-on no way through to a detail screen', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ itemName: 'TENS 3000' }), [
        item({
          id: 'item-2',
          itemName: 'TENS Electrodes 4-pack',
          itemRole: 'optional_addon',
          isConsumable: true,
          returnDate: null,
        }),
      ]),
    ])
    renderLoans()
    await screen.findByText('TENS 3000')

    expect(
      screen.queryByRole('button', { name: /View details for TENS Electrodes 4-pack/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View details for TENS 3000/i })).toBeInTheDocument()
  })

  it('does let a non-consumable add-on be opened', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ itemName: 'OpenBCI Mark IV Ultracortex' }), [
        item({
          id: 'item-2',
          itemName: 'OpenBCI Ganglion Board',
          itemRole: 'optional_addon',
          isConsumable: false,
        }),
      ]),
    ])
    renderLoans()

    await userEvent.click(
      await screen.findByRole('button', { name: /View details for OpenBCI Ganglion Board/i }),
    )
    expect(await screen.findByText('Loan detail')).toBeInTheDocument()
  })

  // Nothing on a row acts on the loan — the row opens it, and cancelling or
  // returning is done on the detail screen.
  it('offers no action on a row but opening it', async () => {
    const due = new Date()
    due.setDate(due.getDate() + 3)
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ id: 'a', loanRequestId: 'req-a', requestStatus: 'pending' })),
      group(item({ id: 'b', loanRequestId: 'req-b', returnDate: due.toISOString().slice(0, 10) })),
      group(item({ id: 'c', loanRequestId: 'req-c', returnDate: '2020-01-01' })),
    ])
    renderLoans()
    await screen.findByText('Checkout requested on 6.23.26')

    expect(screen.queryByRole('button', { name: 'cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'return' })).not.toBeInTheDocument()
    // Every row is still a way through to its loan.
    expect(screen.getAllByRole('button', { name: /View details for/i })).toHaveLength(3)
  })

  // ── Filtering and search ───────────────────────────────────

  it('files each state under the chip it belongs to', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ id: 'a', loanRequestId: 'req-a', requestStatus: 'pending', itemName: 'Pending item' })),
      group(item({ id: 'b', loanRequestId: 'req-b', itemName: 'Active item' })),
      group(
        item({
          id: 'c',
          loanRequestId: 'req-c',
          itemName: 'Returned item',
          returnedAt: '2026-09-02T14:00:00Z',
        }),
      ),
      group(
        item({ id: 'd', loanRequestId: 'req-d', itemName: 'Cancelled item', requestStatus: 'cancelled' }),
      ),
    ])
    renderLoans()
    await screen.findByText('Active item')

    await userEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(screen.getByText('Pending item')).toBeInTheDocument()
    expect(screen.queryByText('Active item')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Current' }))
    expect(screen.getByText('Active item')).toBeInTheDocument()
    expect(screen.queryByText('Returned item')).not.toBeInTheDocument()

    // Both endings live under Past — one finished, one never started.
    await userEvent.click(screen.getByRole('button', { name: 'Past' }))
    expect(screen.getByText('Returned item')).toBeInTheDocument()
    expect(screen.getByText('Cancelled item')).toBeInTheDocument()
    expect(screen.queryByText('Pending item')).not.toBeInTheDocument()
  })

  // Typing an add-on's name should find the loan it belongs to, not strand it.
  it('searches the whole request, and shows the group it matched whole', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ itemName: 'TENS 3000' }), [
        item({ id: 'item-2', itemName: 'TENS Electrodes 4-pack', itemRole: 'optional_addon' }),
      ]),
      group(item({ id: 'other', loanRequestId: 'req-2', itemName: 'Muse 2' })),
    ])
    renderLoans()
    await screen.findByText('TENS 3000')

    await userEvent.type(screen.getByLabelText('Search your hardware loans'), 'electrodes')

    expect(screen.getByText('TENS 3000')).toBeInTheDocument()
    expect(screen.getByText('TENS Electrodes 4-pack')).toBeInTheDocument()
    expect(screen.queryByText('Muse 2')).not.toBeInTheDocument()
  })

  it('finds a loan by its serial number too', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([
      group(item({ itemName: 'Muse 2', serialNumber: 'SYN-HJXPP41T5' })),
      group(item({ id: 'other', loanRequestId: 'req-2', itemName: 'Jetson Nano', serialNumber: 'SYN-QQ92KD10T' })),
    ])
    renderLoans()
    await screen.findByText('Muse 2')

    await userEvent.type(screen.getByLabelText('Search your hardware loans'), 'QQ92')

    expect(screen.getByText('Jetson Nano')).toBeInTheDocument()
    expect(screen.queryByText('Muse 2')).not.toBeInTheDocument()
  })

  it('says so when nothing matches the search', async () => {
    vi.mocked(fetchMemberLoans).mockResolvedValue([group(item())])
    renderLoans()
    await screen.findByText('Muse 2')

    await userEvent.type(screen.getByLabelText('Search your hardware loans'), 'nothing')

    expect(screen.getByText('No hardware loans match your search')).toBeInTheDocument()
  })

  it('says so when the member has no loans at all', async () => {
    renderLoans()

    expect(await screen.findByText("You don't have any hardware loans")).toBeInTheDocument()
  })

  it('says so when the loans cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchMemberLoans).mockRejectedValue(new Error('offline'))
    renderLoans()

    expect(await screen.findByText(/could not load your hardware loans/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
