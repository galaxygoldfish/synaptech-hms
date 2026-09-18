import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import {
  fetchLoanRequestItemDetail,
  handOffLoanRequestItem,
  type AdminLoanRequestDetail,
} from '../lib/loanRequests'
import { fetchProfileById } from '../lib/members'
import { fetchEquipment } from '../lib/inventory'
import HandOffAgreement from '../components/admin-dashboard/HandOffAgreement'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/loanRequests', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanRequests')>('../lib/loanRequests')
  return {
    ...actual,
    fetchLoanRequestItemDetail: vi.fn(),
    fetchSignedAgreementUrl: vi.fn(),
    handOffLoanRequestItem: vi.fn(),
  }
})
vi.mock('../lib/members', async () => {
  const actual = await vi.importActual<typeof import('../lib/members')>('../lib/members')
  return { ...actual, fetchProfileById: vi.fn() }
})
vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return { ...actual, fetchEquipment: vi.fn() }
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

const loan: AdminLoanRequestDetail = {
  id: 'item-1',
  loanRequestId: 'req-1',
  equipmentId: 'eq-1',
  itemName: 'Oculus Quest 2',
  itemDescription: null,
  imageUrl: null,
  serialNumber: 'SYN-5OHTYJ2GX',
  itemRole: 'primary',
  status: 'pending',
  requestedAt: '2026-09-08T17:30:00Z',
  returnDate: '2026-10-08',
  signedAgreementPath: 'bob/req-1/eq-1.pdf',
  signatureName: 'Bob Reyes',
  signatureDate: '2026-09-08',
  reviewedAt: null,
  reviewNote: null,
  returnedAt: null,
  returnedByName: null,
  memberId: 'member-1',
  memberName: 'Bob Reyes',
  memberEmail: 'bob@uw.edu',
  memberDiscord: 'bobreyes',
  reviewerName: null,
  otherItems: [],
}

const member = {
  id: 'member-1',
  first_name: 'Bob',
  last_name: 'Reyes',
  phone: '2065550142',
  student_id: '2422605',
  uw_email: 'bob@uw.edu',
  address: '4218 University Way NE',
  discord: 'bobreyes',
  role: 'member' as const,
  created_at: '2026-08-16T12:00:00Z',
  updated_at: '2026-08-16T12:00:00Z',
}

const equipment = {
  id: 'eq-1',
  name: 'Oculus Quest 2',
  description: null,
  image_url: null,
  product_type: 'hardware' as const,
  category: 'virtual_reality' as const,
  replacement_value: 349.99,
  quantity_total: 2,
  documentation_url: null,
  created_at: '',
  updated_at: '',
}

beforeEach(() => {
  vi.mocked(fetchLoanRequestItemDetail).mockReset().mockResolvedValue(loan)
  vi.mocked(fetchProfileById).mockReset().mockResolvedValue(member)
  vi.mocked(fetchEquipment).mockReset().mockResolvedValue(equipment)
  vi.mocked(handOffLoanRequestItem).mockReset().mockResolvedValue(undefined)
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

// Step 2 is reached from step 1, which passes how the serial was verified.
function renderHandOff(state: unknown = { serialVerifiedBy: 'scan' }) {
  const router = createMemoryRouter(
    [
      { path: '/adminHome/loans/:id/hand-off/agreement', element: <HandOffAgreement /> },
      { path: '/adminHome/loans/:id/hand-off', element: <p>Scan the serial</p> },
      { path: '/adminHome/loans/:id', element: <p>Loan detail</p> },
    ],
    { initialEntries: [{ pathname: '/adminHome/loans/item-1/hand-off/agreement', state }] },
  )
  return render(<RouterProvider router={router} />)
}

describe('HandOffAgreement', () => {
  // The point of the screen is that the admin checks the agreement, so it
  // shows the same one the borrower signed — borrower details, hardware,
  // dates and all — not a summary of it.
  it('renders the agreement with the borrower and hardware details filled in', async () => {
    renderHandOff()

    expect(await screen.findByText('HARDWARE LOAN AGREEMENT')).toBeInTheDocument()
    expect(screen.getByText('2422605')).toBeInTheDocument()
    expect(screen.getByText('4218 University Way NE')).toBeInTheDocument()
    expect(screen.getAllByText('SYN-5OHTYJ2GX').length).toBeGreaterThan(0)
    expect(screen.getByText('$349.99')).toBeInTheDocument()
  })

  // Section 9 is already signed, so it reads the stored signature back
  // instead of offering the borrower's inputs a second time.
  it('reads the borrower signature back, with no way to edit it', async () => {
    renderHandOff()

    // Scoped to section 9's table: the borrower's name also appears up in
    // section 1, and it's the signature specifically that has to read back.
    const signatureTable = (await screen.findByText('Borrower electronic signature')).closest('table')!
    expect(within(signatureTable).getByText('Bob Reyes')).toBeInTheDocument()
    expect(within(signatureTable).getByText('September 8, 2026')).toBeInTheDocument()
    expect(
      screen.queryByText('Borrower signature — type your full legal name'),
    ).not.toBeInTheDocument()
  })

  // Items submitted before signatures were stored have a PDF but no columns
  // to read; saying so beats deriving a plausible-looking name from the
  // profile and presenting it as what they signed.
  it('says so when an older item has no stored signature', async () => {
    vi.mocked(fetchLoanRequestItemDetail).mockResolvedValue({
      ...loan,
      signatureName: null,
      signatureDate: null,
    })

    renderHandOff()

    expect(await screen.findAllByText('Not recorded')).toHaveLength(2)
  })

  it('will not record the hand-off until the manager types their name', async () => {
    renderHandOff()

    const submit = await screen.findByRole('button', { name: 'next' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Your full legal name'), 'Ada Admin')
    expect(submit).toBeEnabled()
  })


  // The serial check is the whole point of step 1; arriving here by URL
  // would skip it, so it sends you back rather than accepting a hand-off
  // nobody verified.
  it('sends you back to the scan step when the serial was never verified', async () => {
    renderHandOff(null)

    expect(await screen.findByText('Scan the serial')).toBeInTheDocument()
    expect(screen.queryByText('HARDWARE LOAN AGREEMENT')).not.toBeInTheDocument()
  })

  it('accepts a hand-off verified by manual attestation too', async () => {
    renderHandOff({ serialVerifiedBy: 'attestation' })

    expect(await screen.findByText('HARDWARE LOAN AGREEMENT')).toBeInTheDocument()
  })

  it('records the hand-off under the typed name, not the signed-in account', async () => {
    renderHandOff()
    await userEvent.type(await screen.findByPlaceholderText('Your full legal name'), 'Casey Officer')
    await userEvent.click(screen.getByRole('button', { name: 'next' }))

    await waitFor(() => expect(handOffLoanRequestItem).toHaveBeenCalled())
    const call = vi.mocked(handOffLoanRequestItem).mock.calls[0][0]
    expect(call.itemId).toBe('item-1')
    expect(call.adminId).toBe('admin-1')
    // Section 10 asks who physically received and handed over the hardware,
    // which needn't be whoever happens to be logged in.
    expect(call.adminName).toBe('Casey Officer')
    expect(call.attestedAt).toBeInstanceOf(Date)

    expect(await screen.findByText('Loan detail')).toBeInTheDocument()
  })

  it('stays put and says so when recording fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(handOffLoanRequestItem).mockRejectedValue(new Error('offline'))

    renderHandOff()
    await userEvent.type(await screen.findByPlaceholderText('Your full legal name'), 'Ada Admin')
    await userEvent.click(screen.getByRole('button', { name: 'next' }))

    expect(await screen.findByText(/could not record the hand-off/i)).toBeInTheDocument()
    expect(screen.queryByText('Loan detail')).not.toBeInTheDocument()
    consoleError.mockRestore()
  })
})
