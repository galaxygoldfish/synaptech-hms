import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { fetchAllProfiles, peekAllProfiles } from '../lib/members'
import ViewMembers from '../components/admin-dashboard/ViewMembers'
import type { Profile } from '../types/index'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/members', async () => {
  const actual = await vi.importActual<typeof import('../lib/members')>('../lib/members')
  return { ...actual, fetchAllProfiles: vi.fn(), peekAllProfiles: vi.fn() }
})

const bob: Profile = {
  id: 'member-1',
  first_name: 'Bob',
  last_name: 'Reyes',
  phone: '2065550000',
  student_id: '1234567',
  uw_email: 'bob@uw.edu',
  address: '1 Way',
  discord: 'bob',
  role: 'member',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'admin-1', email: 'ada@uw.edu' } } as unknown as Session,
    profile: { ...bob, id: 'admin-1', first_name: 'Ada', last_name: 'Admin', role: 'admin' },
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(fetchAllProfiles).mockReset().mockResolvedValue([bob])
  vi.mocked(peekAllProfiles).mockReset().mockReturnValue(null)
})

function renderAt(path: string, routes: { path: string; element: React.ReactNode }[]) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
}

describe('list screens paint their last-loaded copy', () => {
  it('draws a list from its last-loaded copy on the first render, then refreshes it', async () => {
    vi.mocked(peekAllProfiles).mockReturnValue([bob])

    renderAt('/adminHome/members', [{ path: '/adminHome/members', element: <ViewMembers /> }])

    expect(screen.getByText('Bob Reyes')).toBeInTheDocument()
    await waitFor(() => expect(fetchAllProfiles).toHaveBeenCalled())
  })
})
