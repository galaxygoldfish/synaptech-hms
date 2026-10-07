import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import ProfileSetupPage from '../pages/ProfileSetupPage'
import { supabase } from '../lib/supabase'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}))

const mockSession = {
  user: { id: 'user-123', email: 'test@uw.edu' },
} as unknown as Session

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    session: mockSession,
    profile: null,
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  })
})

describe('ProfileSetupPage — form validation', () => {
  it('shows required field errors when the form is submitted empty', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Last name is required.')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required.')).toBeInTheDocument()
    expect(screen.getByText('UW student ID is required.')).toBeInTheDocument()
    expect(screen.getByText('Home address is required.')).toBeInTheDocument()
    expect(screen.getByText('Discord username is required.')).toBeInTheDocument()
  })

  // A screen-reader user can't see the red text beside a field, so the
  // message has to be tied to the input and focus taken to the first one.
  it('ties each error to its field and focuses the first invalid one', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    const firstName = screen.getByLabelText(/first name/i)
    expect(firstName).toHaveAttribute('aria-invalid', 'true')
    expect(firstName).toHaveAccessibleDescription('First name is required.')
    await vi.waitFor(() => expect(firstName).toHaveFocus())
  })

  it('shows a phone format error for non-phone input', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)

    await user.type(screen.getByLabelText(/phone number/i), 'not-a-phone!!!')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText(/enter a valid phone number/i)).toBeInTheDocument()
  })

  it('shows a student ID error for non-numeric input', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)

    await user.type(screen.getByLabelText(/uw student id/i), 'abc123')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText('UW student ID must contain only numbers.')).toBeInTheDocument()
  })

  it('clears a field error once the user starts correcting it', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText('First name is required.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/first name/i), 'J')
    expect(screen.queryByText('First name is required.')).not.toBeInTheDocument()
  })

  it('pre-fills and locks the UW email field from the session', () => {
    render(<ProfileSetupPage />)
    const emailInput = screen.getByDisplayValue('test@uw.edu')
    expect(emailInput).toHaveAttribute('readonly')
  })
})

describe('ProfileSetupPage — privacy policy consent', () => {
  async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/last name/i), 'Smith')
    await user.type(screen.getByLabelText(/phone number/i), '(206) 555-0000')
    await user.type(screen.getByLabelText(/uw student id/i), '1234567')
    await user.type(screen.getByLabelText(/home address/i), '123 Main St, Seattle, WA 98101')
    await user.type(screen.getByLabelText(/discord username/i), 'jane')
  }

  it('links the privacy policy, opening in a new tab', () => {
    render(<ProfileSetupPage />)
    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('docs.google.com'))
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('will not create the profile until the policy is agreed to', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    const checkbox = screen.getByRole('checkbox', { name: /agree to the synaptech hms privacy policy/i })
    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox).toHaveAccessibleDescription('You must agree to the Privacy Policy to continue.')
    await vi.waitFor(() => expect(checkbox).toHaveFocus())
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('creates the profile once the policy is agreed to', async () => {
    const user = userEvent.setup()
    render(<ProfileSetupPage />)
    await fillValidForm(user)

    await user.click(screen.getByRole('button', { name: /continue/i }))
    await user.click(screen.getByRole('checkbox', { name: /privacy policy/i }))
    expect(screen.queryByText(/must agree to the privacy policy/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(supabase.from).toHaveBeenCalledWith('profiles')
  })
})
