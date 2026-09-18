import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchLoanRequestItemDetail,
  markLoanRequestItemReturned,
  type AdminLoanRequestDetail,
} from '../lib/loanRequests'
import ReturnConfirm from '../components/admin-dashboard/return-hardware/ReturnConfirm'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return {
    ...actual,
    fetchLoanRequestItemDetail: vi.fn(),
    markLoanRequestItemReturned: vi.fn(),
  }
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

const detail: AdminLoanRequestDetail = {
  id: 'item-1',
  loanRequestId: 'req-1',
  equipmentId: 'eq-1',
  itemName: 'Muse 2',
  itemDescription: null,
  imageUrl: null,
  serialNumber: 'SYN-HJXPP41T5',
  itemRole: 'primary',
  status: 'approved',
  requestedAt: '2026-09-01T17:30:00Z',
  returnDate: '2099-10-12',
  signedAgreementPath: 'bob/req-1/eq-1.pdf',
  signatureName: 'Bob Reyes',
  signatureDate: '2026-09-01',
  reviewedAt: '2026-09-02T10:00:00Z',
  reviewNote: null,
  returnRequestedAt: null,
  returnedAt: null,
  returnedByName: null,
  memberId: 'member-1',
  memberName: 'Bob Reyes',
  memberEmail: 'bob@uw.edu',
  memberDiscord: 'bobreyes',
  reviewerName: 'Ada Admin',
  otherItems: [],
}

beforeEach(() => {
  vi.mocked(fetchLoanRequestItemDetail).mockReset().mockResolvedValue(detail)
  vi.mocked(markLoanRequestItemReturned).mockReset().mockResolvedValue(undefined)
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

// Step 2 is reached from step 1, which passes how the loan was established.
function renderConfirm(state: unknown = { serialVerifiedBy: 'scan' }) {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/return/:id/confirm', element: <ReturnConfirm /> },
      { path: '/adminHome/return', element: <p>Scan a barcode</p> },
      { path: '/adminHome', element: <p>Admin dashboard</p> },
    ],
    { initialEntries: [{ pathname: '/adminHome/return/item-1/confirm', state }] },
  )
  return render(<RouterProvider router={router} />)
}

describe('ReturnConfirm', () => {
  it('shows the hardware and the loan it is coming back from', async () => {
    renderConfirm()

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
    expect(screen.getByText('SYN-HJXPP41T5')).toBeInTheDocument()
    expect(screen.getByText('Bob Reyes')).toBeInTheDocument()
    expect(screen.getByText('Returned by')).toBeInTheDocument()
  })

  it('records the return under the signed-in admin', async () => {
    renderConfirm()

    await userEvent.click(await screen.findByRole('button', { name: 'mark as returned' }))

    await waitFor(() => expect(markLoanRequestItemReturned).toHaveBeenCalledWith('item-1', 'admin-1'))
  })

  it('finishes on a success screen once the return is recorded', async () => {
    renderConfirm()

    await userEvent.click(await screen.findByRole('button', { name: 'mark as returned' }))

    expect(await screen.findByText('Hardware returned')).toBeInTheDocument()
    expect(screen.getByText(/Muse 2 \(SYN-HJXPP41T5\) is back in stock/)).toBeInTheDocument()
    // The email is the migration's trigger, not this screen's doing, but the
    // admin is told it went out.
    expect(screen.getByText(/Bob Reyes has been emailed a confirmation/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'done' }))
    expect(await screen.findByText('Admin dashboard')).toBeInTheDocument()
  })

  it('stays put and says so when recording fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(markLoanRequestItemReturned).mockRejectedValue(new Error('offline'))

    renderConfirm()
    await userEvent.click(await screen.findByRole('button', { name: 'mark as returned' }))

    expect(await screen.findByText(/could not record the return/i)).toBeInTheDocument()
    expect(screen.queryByText('Hardware returned')).not.toBeInTheDocument()
    // Still offering the action, so it can be retried.
    expect(screen.getByRole('button', { name: 'mark as returned' })).toBeEnabled()
    consoleError.mockRestore()
  })

  // Late hardware is the one thing on this screen an admin might need to act
  // on, so the due date says so itself rather than leaving them to work it
  // out from today's.
  it('marks an overdue loan\'s due date as the alert it is', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue({ ...detail, returnDate: '2020-01-01' })

    renderConfirm()

    const dueBack = await screen.findByText('January 1, 2020')
    expect(dueBack.className).toMatch(/confirmValueOverdue/)
  })

  // Reached by scanning a unit whose return was recorded moments ago on
  // another device: offering to close it twice would be worse than saying so.
  it('refuses a loan that has already been returned', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue({
      ...detail,
      returnedAt: '2026-09-10T12:00:00Z',
      returnedByName: 'Casey Officer',
    })

    renderConfirm()

    expect(
      await screen.findByText(/Muse 2 was already returned on September 10, 2026, recorded by Casey Officer/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'mark as returned' })).not.toBeInTheDocument()
  })

  // Step 1 is what decided this is the right loan; arriving by URL skips it.
  it('sends you back to the scan step when no step 1 led here', async () => {
    renderConfirm(null)

    expect(await screen.findByText('Scan a barcode')).toBeInTheDocument()
    expect(markLoanRequestItemReturned).not.toHaveBeenCalled()
  })

  it('accepts a loan picked off the database list too', async () => {
    renderConfirm({ serialVerifiedBy: 'database' })

    expect(await screen.findByText('Muse 2')).toBeInTheDocument()
  })

  it('says so when the loan cannot be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchLoanRequestItemDetail).mockRejectedValue(new Error('offline'))

    renderConfirm()

    expect(await screen.findByText(/could not load this loan/i)).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
