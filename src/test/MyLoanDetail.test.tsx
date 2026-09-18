import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { cancelLoanRequest, fetchMemberLoanItem, type MemberLoanItem } from '../lib/memberLoans'
import { cancelReturnRequest, fetchAvailability } from '../lib/availability'
import { fetchSignedAgreementUrl } from '../lib/loanRequests'
import MyLoanDetail from '../components/user-dashboard/MyLoanDetail'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/memberLoans', async () => {
  const actual = await vi.importActual<typeof import('../lib/memberLoans')>('../lib/memberLoans')
  return { ...actual, fetchMemberLoanItem: vi.fn(), cancelLoanRequest: vi.fn() }
})

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return { ...actual, fetchSignedAgreementUrl: vi.fn() }
})

vi.mock('../lib/availability', async () => {
  const actual = await vi.importActual<typeof import('../lib/availability')>('../lib/availability')
  return { ...actual, cancelReturnRequest: vi.fn(), fetchAvailability: vi.fn(), saveAvailability: vi.fn() }
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
    itemDescription: 'A headband-style forehead EEG recording device',
    imageUrl: null,
    documentationUrl: 'https://example.com/muse-2',
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

beforeEach(() => {
  vi.mocked(fetchMemberLoanItem).mockReset().mockResolvedValue(item())
  vi.mocked(cancelLoanRequest).mockReset().mockResolvedValue(undefined)
  vi.mocked(fetchSignedAgreementUrl).mockReset().mockResolvedValue('https://signed.example/a.pdf')
  vi.mocked(cancelReturnRequest).mockReset().mockResolvedValue(undefined)
  vi.mocked(fetchAvailability).mockReset().mockResolvedValue([])
  vi.stubGlobal('open', vi.fn())
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

function renderDetail() {
  const router = createMemoryRouter(
    [
      { path: '/home/loans/:id', element: <MyLoanDetail /> },
      { path: '/home/loans', element: <p>My hardware loans</p> },
      { path: '/home/loans/:id/return', element: <p>Return availability for item-1</p> },
    ],
    { initialEntries: ['/home/loans/item-1'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('MyLoanDetail', () => {
  it('describes the item and what its loan is doing', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Muse 2' })).toBeInTheDocument()
    expect(screen.getByText('A headband-style forehead EEG recording device')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Checked out on June 23rd, 2026')).toBeInTheDocument()
    expect(screen.getByText('Return by September 1st, 2099')).toBeInTheDocument()
  })

  // ── Which actions each state offers ─────────────────────────

  it('offers a return on a loan the member is holding', async () => {
    renderDetail()

    expect(await screen.findByRole('button', { name: /start return/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel request/i })).not.toBeInTheDocument()
  })

  it('offers cancelling and editing availability on a request', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ requestStatus: 'pending' }))
    renderDetail()

    expect(await screen.findByRole('button', { name: /cancel request/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit checkout availability/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start return/i })).not.toBeInTheDocument()
  })

  it('offers neither on a loan that is over', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ returnedAt: '2026-09-02T14:00:00Z' }))
    renderDetail()

    expect(await screen.findByText('Returned')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start return/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel request/i })).not.toBeInTheDocument()
    // The reading actions stay: the agreement is still theirs to keep.
    expect(
      screen.getByRole('button', { name: /download signed hardware loan agreement/i }),
    ).toBeInTheDocument()
  })

  it('sends Start return to the availability step', async () => {
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /start return/i }))

    expect(await screen.findByText('Return availability for item-1')).toBeInTheDocument()
  })

  // A return already raised: the way forward is gone, and what is left is
  // changing the hours or withdrawing the ask.
  it('offers withdrawing and editing once a return has been requested', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(
      item({ returnRequestedAt: '2026-09-10T10:00:00Z' }),
    )
    renderDetail()

    expect(await screen.findByText('Processing return request')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel return request/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit return availability/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start return/i })).not.toBeInTheDocument()
  })

  // Withdrawing is only the asking — the hardware stays out, so the loan goes
  // back to active rather than ending and the member stays on the screen.
  it('withdraws a return request without ending the loan', async () => {
    vi.mocked(fetchMemberLoanItem)
      .mockResolvedValueOnce(item({ returnRequestedAt: '2026-09-10T10:00:00Z' }))
      .mockResolvedValue(item())
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /cancel return request/i }))
    const dialog = screen.getByRole('dialog', { name: /withdraw this return request/i })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw request' }))

    await waitFor(() => expect(cancelReturnRequest).toHaveBeenCalledWith('req-1', 'item-1'))
    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.queryByText('My hardware loans')).not.toBeInTheDocument()
  })

  it('opens the availability editor on the right set of hours', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ requestStatus: 'pending' }))
    renderDetail()

    await userEvent.click(
      await screen.findByRole('button', { name: /edit checkout availability/i }),
    )

    expect(
      await screen.findByRole('dialog', { name: /edit checkout availability/i }),
    ).toBeInTheDocument()
  })

  // ── The agreement ──────────────────────────────────────────

  it('opens whichever copy of the agreement is on the record', async () => {
    renderDetail()

    await userEvent.click(
      await screen.findByRole('button', { name: /download signed hardware loan agreement/i }),
    )

    expect(fetchSignedAgreementUrl).toHaveBeenCalledWith('member/req-1/eq-1.pdf', { download: true })
  })

  // Nothing to download is not a broken button; it is no button.
  it('hides the agreement row when there is no file', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ signedAgreementPath: null }))
    renderDetail()

    await screen.findByRole('heading', { name: 'Muse 2' })
    expect(
      screen.queryByRole('button', { name: /download signed hardware loan agreement/i }),
    ).not.toBeInTheDocument()
  })

  it('says so when the agreement will not open', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchSignedAgreementUrl).mockRejectedValue(new Error('offline'))
    renderDetail()

    await userEvent.click(
      await screen.findByRole('button', { name: /download signed hardware loan agreement/i }),
    )

    expect(await screen.findByText(/could not open your loan agreement/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })

  // ── Documentation and support ──────────────────────────────

  it('opens the product documentation when there is any', async () => {
    renderDetail()

    await userEvent.click(
      await screen.findByRole('button', { name: /view item-specific documentation/i }),
    )

    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/muse-2',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('disables the documentation row for a product with none', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ documentationUrl: null }))
    renderDetail()

    expect(
      await screen.findByRole('button', { name: /view item-specific documentation/i }),
    ).toBeDisabled()
  })

  it('points help and support at the club Discord', async () => {
    renderDetail()

    const help = await screen.findByRole('link', { name: /get help & support/i })
    expect(help).toHaveAttribute('href', 'https://discord.gg/zNKCN5233Y')
  })

  // ── Cancelling from here ───────────────────────────────────

  it('cancels the whole request and returns to the list', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ requestStatus: 'pending' }))
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /cancel request/i }))
    const dialog = screen.getByRole('dialog', { name: /cancel this request/i })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }))

    expect(cancelLoanRequest).toHaveBeenCalledWith('req-1')
    expect(await screen.findByText('My hardware loans')).toBeInTheDocument()
  })

  it('warns that add-ons go with it before cancelling', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ requestStatus: 'pending' }))
    renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: /cancel request/i }))

    expect(screen.getByText(/anything requested alongside it/i)).toBeInTheDocument()
    expect(cancelLoanRequest).not.toHaveBeenCalled()
  })

  it('says so when the loan cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchMemberLoanItem).mockRejectedValue(new Error('offline'))
    renderDetail()

    expect(await screen.findByText(/could not load this loan/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
