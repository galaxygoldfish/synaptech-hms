import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchMemberLoanItem, type MemberLoanItem } from '../lib/memberLoans'
import { requestReturn } from '../lib/availability'
import ReturnAvailability from '../components/user-dashboard/ReturnAvailability'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/memberLoans', async () => {
  const actual = await vi.importActual<typeof import('../lib/memberLoans')>('../lib/memberLoans')
  return { ...actual, fetchMemberLoanItem: vi.fn() }
})

vi.mock('../lib/availability', async () => {
  const actual = await vi.importActual<typeof import('../lib/availability')>('../lib/availability')
  return { ...actual, requestReturn: vi.fn() }
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

beforeEach(() => {
  vi.mocked(fetchMemberLoanItem).mockReset().mockResolvedValue(item())
  vi.mocked(requestReturn).mockReset().mockResolvedValue(undefined)
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

function renderReturn() {
  const router = createMemoryRouter(
    [
      { path: '/home/loans/:id/return', element: <ReturnAvailability /> },
      { path: '/home/loans/:id', element: <p>Loan detail</p> },
      { path: '/home/loans', element: <p>My hardware loans</p> },
    ],
    { initialEntries: ['/home/loans/item-1/return'] },
  )
  return render(<RouterProvider router={router} />)
}

/** The first hour of the first day — waits for the grid to land first. */
async function firstSlot() {
  const slots = await screen.findAllByRole('button', { name: /at 8:00 AM$/i })
  return slots[0]
}

describe('ReturnAvailability', () => {
  it('asks for the next two weeks of availability', async () => {
    renderReturn()

    // Two copies in the heading too — the normal title and a phone-only,
    // shorter one CSS swaps in by breakpoint (both render in jsdom, which
    // has none), so its accessible name is their concatenation.
    expect(await screen.findByRole('heading', { name: /Initiate hardware return/ })).toBeInTheDocument()
    // Two copies in the DOM — the normal wording and a phone-only, shorter
    // one CSS swaps in by breakpoint (both render in jsdom, which has none).
    expect(screen.getAllByText(/enter your availability for the next two weeks/i)).toHaveLength(2)
    // Fourteen days of 8am–10pm.
    expect(screen.getAllByRole('button', { name: /at 8:00 AM$/i })).toHaveLength(14)
  })

  // Nothing to schedule against is not a return request worth raising.
  it('will not submit until at least one hour is picked', async () => {
    renderReturn()

    const done = await screen.findByRole('button', { name: 'done' })
    expect(done).toBeDisabled()

    await userEvent.click(await firstSlot())
    expect(done).toBeEnabled()
  })

  it('records the picked hours against the item being returned', async () => {
    renderReturn()

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: 'done' }))

    const call = vi.mocked(requestReturn).mock.calls[0][0]
    expect(call.loanRequestId).toBe('req-1')
    expect(call.loanRequestItemId).toBe('item-1')
    expect(call.memberId).toBe('member-1')
    expect(call.slots).toHaveLength(1)
    expect(call.slots[0].hour).toBe(8)
  })

  it('finishes on the success screen, and Done goes back to the loans list', async () => {
    renderReturn()

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: 'done' }))

    expect(await screen.findByRole('heading', { name: 'Success!' })).toBeInTheDocument()
    expect(
      screen.getByText(/your request to return hardware was submitted successfully/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'done' }))
    expect(await screen.findByText('My hardware loans')).toBeInTheDocument()
  })

  it('keeps the grid and says so when submitting fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(requestReturn).mockRejectedValue(new Error('offline'))
    renderReturn()

    await userEvent.click(await firstSlot())
    await userEvent.click(screen.getByRole('button', { name: 'done' }))

    expect(await screen.findByText(/could not submit your return request/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Success!' })).not.toBeInTheDocument()
    consoleError.mockRestore()
  })

  // Only hardware actually in the member's hands can be handed back.
  it('refuses a loan that is not out with the member', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(item({ requestStatus: 'pending' }))
    renderReturn()

    expect(await screen.findByText(/not out with you, so there is nothing to return/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'done' })).toBeDisabled()
  })

  it('refuses a return that has already been asked for', async () => {
    vi.mocked(fetchMemberLoanItem).mockResolvedValue(
      item({ returnRequestedAt: '2026-09-10T10:00:00Z' }),
    )
    renderReturn()

    expect(await screen.findByText(/already asked to return this/i)).toBeInTheDocument()
  })

  it('goes back to the loan', async () => {
    renderReturn()

    await userEvent.click(await screen.findByRole('button', { name: 'Back' }))

    expect(await screen.findByText('Loan detail')).toBeInTheDocument()
  })

  // Filling out availability speeds up scheduling but was never required to
  // ask for a return — skip submits with none attached.
  it('lets a member skip straight to submitting, with no availability', async () => {
    renderReturn()

    await userEvent.click(await screen.findByRole('button', { name: 'skip' }))

    expect(await screen.findByRole('heading', { name: 'Success!' })).toBeInTheDocument()
    expect(vi.mocked(requestReturn)).toHaveBeenCalledWith(
      expect.objectContaining({ slots: [] }),
    )
  })
})
