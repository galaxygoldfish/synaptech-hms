import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { countAdmins, deleteMember, fetchProfileById } from '../lib/members'
import MemberDetail from '../components/admin-dashboard/MemberDetail'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/members', async () => {
  const actual = await vi.importActual<typeof import('../lib/members')>('../lib/members')
  return {
    ...actual,
    fetchProfileById: vi.fn(),
    updateMemberRole: vi.fn(),
    countAdmins: vi.fn(),
    deleteMember: vi.fn(),
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

const HOME_ADDRESS = '14271 Lake Hills Boulevard'

const member = {
  id: 'member-1',
  first_name: 'Bob',
  last_name: 'Reyes',
  phone: '4253946221',
  student_id: '2422605',
  uw_email: 'bob@uw.edu',
  address: HOME_ADDRESS,
  discord: 'bobreyes',
  role: 'member' as const,
  created_at: '2026-08-16T12:00:00Z',
  updated_at: '2026-08-16T12:00:00Z',
}

beforeEach(() => {
  mockNavigate.mockReset()
  vi.mocked(fetchProfileById).mockReset().mockResolvedValue(member)
  vi.mocked(countAdmins).mockReset().mockResolvedValue(2)
  vi.mocked(deleteMember).mockReset().mockResolvedValue(undefined)
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

function renderMemberDetail() {
  const router = createMemoryRouter([{ path: '/adminHome/members/:id', element: <MemberDetail /> }], {
    initialEntries: ['/adminHome/members/member-1'],
  })
  return render(<RouterProvider router={router} />)
}

describe('MemberDetail — the home address', () => {
  // Opening someone's profile to check their Discord handle shouldn't also
  // put their home address on screen in a shared room or a screen share.
  it('is not on screen when the profile first loads', async () => {
    renderMemberDetail()

    expect(await screen.findByText('Bob Reyes')).toBeInTheDocument()
    expect(screen.queryByText(HOME_ADDRESS)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal home address' })).toBeInTheDocument()
  })

  it('shows it when an admin deliberately asks for it, and hides it again', async () => {
    renderMemberDetail()
    await userEvent.click(await screen.findByRole('button', { name: 'Reveal home address' }))

    expect(screen.getByText(HOME_ADDRESS)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Hide home address' }))
    expect(screen.queryByText(HOME_ADDRESS)).not.toBeInTheDocument()
  })

  // The address is masked, not withheld — the rest of the record is exactly
  // as it was, and this is the one field that changed.
  it('leaves the other details visible', async () => {
    renderMemberDetail()

    expect(await screen.findByText('bob@uw.edu')).toBeInTheDocument()
    expect(screen.getByText('2422605')).toBeInTheDocument()
    expect(screen.getByText('4253946221')).toBeInTheDocument()
  })
})

describe('MemberDetail — delete account', () => {
  it('deletes the member and returns to the list on confirm', async () => {
    renderMemberDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    await screen.findByRole('dialog', { name: 'Delete account?' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete account' })[1])

    expect(deleteMember).toHaveBeenCalledWith('member-1')
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/adminHome/members'))
  })

  it('signs the admin out instead of navigating when they delete their own account', async () => {
    vi.mocked(fetchProfileById).mockResolvedValue({ ...member, id: 'admin-1' })
    const signOut = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      profile: adminProfile,
      loading: false,
      accountError: false,
      profileFetchError: false,
      signInWithGoogle: vi.fn(),
      signOut,
      updateProfile: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)

    renderMemberDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete account' })[1])

    expect(signOut).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('warns before deleting the only remaining admin', async () => {
    vi.mocked(fetchProfileById).mockResolvedValue({ ...member, role: 'admin' })
    vi.mocked(countAdmins).mockResolvedValue(1)

    renderMemberDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))

    expect(
      await screen.findByText('This is the only admin account — deleting it will lock everyone out of the admin dashboard.'),
    ).toBeInTheDocument()
  })

  it('shows an error and keeps the dialog open when the delete call fails', async () => {
    vi.mocked(deleteMember).mockRejectedValue(new Error('boom'))

    renderMemberDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete account' })[1])

    expect(await screen.findByText('Could not delete this account. Please try again.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
