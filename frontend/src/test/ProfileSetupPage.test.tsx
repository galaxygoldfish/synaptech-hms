import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import ProfileSetupPage from '../pages/ProfileSetupPage'

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
    expect(screen.getByText('Student ID is required.')).toBeInTheDocument()
    expect(screen.getByText('Home address is required.')).toBeInTheDocument()
    expect(screen.getByText('Discord username is required.')).toBeInTheDocument()
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

    await user.type(screen.getByLabelText(/student id number/i), 'abc123')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText('Student ID must contain only numbers.')).toBeInTheDocument()
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
