import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canExtend, fetchMemberLoanItem, requestExtension, type MemberLoanItem } from '../lib/memberLoans'
import { fetchEquipmentByIds } from '../lib/inventory'
import { buildLoanAgreementPdf } from '../lib/loanAgreementPdf'
import ExtendLoan from '../components/user-dashboard/ExtendLoan'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/memberLoans', async () => {
  const actual = await vi.importActual<typeof import('../lib/memberLoans')>('../lib/memberLoans')
  return { ...actual, fetchMemberLoanItem: vi.fn(), canExtend: vi.fn(), requestExtension: vi.fn() }
})

vi.mock('../lib/inventory', async () => {
  const actual = await vi.importActual<typeof import('../lib/inventory')>('../lib/inventory')
  return { ...actual, fetchEquipmentByIds: vi.fn() }
})

vi.mock('../lib/loanAgreementPdf', async () => {
  const actual = await vi.importActual<typeof import('../lib/loanAgreementPdf')>('../lib/loanAgreementPdf')
  return { ...actual, buildLoanAgreementPdf: vi.fn(), preloadAgreementPdfLib: vi.fn() }
})

const profile = {
  id: 'u1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  role: 'member' as const,
  uw_email: 'ada@uw.edu',
  discord: 'ada',
  address: '1 Way',
  phone: '555',
  student_id: '123',
}

function item(overrides: Partial<MemberLoanItem> = {}): MemberLoanItem {
  return {
    id: 'i1',
    loanRequestId: 'r1',
    equipmentId: 'e1',
    itemName: 'Muse 2',
    itemDescription: null,
    imageUrl: null,
    documentationUrl: null,
    isConsumable: false,
    itemRole: 'primary',
    serialNumber: 'SYN-1',
    requestStatus: 'approved',
    requestedAt: '2026-10-01T17:30:00Z',
    reviewedAt: '2026-10-02T18:00:00Z',
    returnDate: '2026-12-15',
    returnRequestedAt: null,
    returnedAt: null,
    signedAgreementPath: 'u1/r1/e1-approved.pdf',
    cancellationReason: null,
    extensionStatus: null,
    extensionReturnDate: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  // Inside the autumn window, so Mar 10 is a date the picker allows.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 11, 5, 12))
  vi.mocked(fetchMemberLoanItem).mockReset().mockResolvedValue(item())
  vi.mocked(canExtend).mockReset().mockReturnValue(true)
  vi.mocked(requestExtension).mockReset().mockResolvedValue(undefined)
  vi.mocked(fetchEquipmentByIds).mockReset().mockResolvedValue([
    { id: 'e1', name: 'Muse 2', replacement_value: 250 } as never,
  ])
  vi.mocked(buildLoanAgreementPdf).mockReset().mockResolvedValue({
    output: () => new Blob(['%PDF'], { type: 'application/pdf' }),
  } as never)
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'u1' } },
    profile,
    loading: false,
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})

function renderExtend() {
  const router = createMemoryRouter(
    [
      { path: '/home/loans/:id/extend', element: <ExtendLoan /> },
      { path: '/home/loans/:id', element: <p>Loan details page</p> },
    ],
    { initialEntries: ['/home/loans/i1/extend'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('ExtendLoan', () => {
  it('sends the member back when the loan cannot be extended', async () => {
    vi.mocked(canExtend).mockReturnValue(false)
    renderExtend()
    expect(await screen.findByText('Loan details page')).toBeInTheDocument()
  })

  it('says extensions are only for project groups', async () => {
    renderExtend()
    expect(await screen.findByText('Extensions are only for loans for project groups.')).toBeInTheDocument()
  })

  it('needs a new date and a signature before submitting', async () => {
    renderExtend()
    const submit = await screen.findByRole('button', { name: /request extension/i })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/new return date/i), '2027-03-10')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/borrower signature/i), 'Ada Lovelace')
    expect(submit).toBeEnabled()
  })

  it('submits the re-signed agreement and returns to the loan', async () => {
    renderExtend()
    await userEvent.type(await screen.findByLabelText(/new return date/i), '2027-03-10')
    await userEvent.type(screen.getByLabelText(/borrower signature/i), 'Ada Lovelace')
    await userEvent.click(screen.getByRole('button', { name: /request extension/i }))

    await waitFor(() => expect(requestExtension).toHaveBeenCalled())
    const input = vi.mocked(requestExtension).mock.calls[0][0]
    expect(input.newReturnDate).toBe('2027-03-10')
    expect(input.userId).toBe('u1')
    expect(input.signatureName).toBe('Ada Lovelace')
    expect(input.agreementFile).toBeInstanceOf(File)
    expect(buildLoanAgreementPdf).toHaveBeenCalledWith(
      expect.objectContaining({ serialNumber: 'SYN-1', productName: 'Muse 2', replacementValue: '$250.00' }),
    )
    expect(await screen.findByText('Loan details page')).toBeInTheDocument()
  })

  it('passes on why the database refused the request', async () => {
    vi.mocked(requestExtension).mockRejectedValue({
      message: 'Please wait a few minutes before asking for another extension',
      code: 'P0001',
    })
    renderExtend()
    await userEvent.type(await screen.findByLabelText(/new return date/i), '2027-03-10')
    await userEvent.type(screen.getByLabelText(/borrower signature/i), 'Ada Lovelace')
    await userEvent.click(screen.getByRole('button', { name: /request extension/i }))

    expect(await screen.findByText('Please wait a few minutes before asking for another extension.')).toBeInTheDocument()
  })

  it('says so when the request fails', async () => {
    vi.mocked(requestExtension).mockRejectedValue(new Error('nope'))
    renderExtend()
    await userEvent.type(await screen.findByLabelText(/new return date/i), '2027-03-10')
    await userEvent.type(screen.getByLabelText(/borrower signature/i), 'Ada Lovelace')
    await userEvent.click(screen.getByRole('button', { name: /request extension/i }))

    expect(await screen.findByText('Could not submit your extension. Please try again.')).toBeInTheDocument()
  })
})
