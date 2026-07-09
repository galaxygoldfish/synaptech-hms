import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { useAuth } from '../context/AuthContext'
import { PublicRoute, SetupRoute, PrivateRoute, AdminRoute } from '../router'
import type { Profile } from '../types/index'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const memberProfile: Profile = {
  id: 'user-123',
  first_name: 'Jane',
  last_name: 'Smith',
  phone: '2065550000',
  student_id: '1234567',
  uw_email: 'jane@uw.edu',
  address: '123 Main St',
  discord: 'jane',
  role: 'member',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const adminProfile: Profile = { ...memberProfile, role: 'admin' }

const mockSession = { user: { id: 'user-123', email: 'jane@uw.edu' } } as unknown as Session

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    session: null,
    profile: null,
    loading: false,
    accountError: false,
    profileFetchError: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
    ...overrides,
  })
}

// Wraps a guard in a minimal router so Navigate destinations are resolvable.
function renderGuard(element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/guarded']}>
      <Routes>
        <Route path="/guarded"   element={element} />
        <Route path="/"          element={<div>Welcome Page</div>} />
        <Route path="/home"      element={<div>Home Page</div>} />
        <Route path="/setup"     element={<div>Setup Page</div>} />
        <Route path="/adminHome" element={<div>Admin Home Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

const Child = () => <div>Protected Content</div>

// ── PublicRoute (/): unauthenticated only ─────────────────────────────────────

describe('PublicRoute', () => {
  it('shows loading screen while auth is resolving', () => {
    mockAuth({ loading: true })
    renderGuard(<PublicRoute><Child /></PublicRoute>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders children when there is no session', () => {
    mockAuth()
    renderGuard(<PublicRoute><Child /></PublicRoute>)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('shows profile fetch error inline', () => {
    mockAuth({ session: mockSession, profileFetchError: true })
    renderGuard(<PublicRoute><Child /></PublicRoute>)
    expect(screen.getByText(/something went wrong loading your profile/i)).toBeInTheDocument()
  })

  it('redirects a member to /home', () => {
    mockAuth({ session: mockSession, profile: memberProfile })
    renderGuard(<PublicRoute><Child /></PublicRoute>)
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('redirects an admin to /adminHome', () => {
    mockAuth({ session: mockSession, profile: adminProfile })
    renderGuard(<PublicRoute><Child /></PublicRoute>)
    expect(screen.getByText('Admin Home Page')).toBeInTheDocument()
  })

  it('redirects to /setup when session exists but no profile yet', () => {
    mockAuth({ session: mockSession })
    renderGuard(<PublicRoute><Child /></PublicRoute>)
    expect(screen.getByText('Setup Page')).toBeInTheDocument()
  })
})

// ── SetupRoute (/setup): session required, no profile yet ─────────────────────

describe('SetupRoute', () => {
  it('shows loading screen while auth is resolving', () => {
    mockAuth({ loading: true })
    renderGuard(<SetupRoute><Child /></SetupRoute>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to / when there is no session', () => {
    mockAuth()
    renderGuard(<SetupRoute><Child /></SetupRoute>)
    expect(screen.getByText('Welcome Page')).toBeInTheDocument()
  })

  it('shows profile fetch error inline', () => {
    mockAuth({ session: mockSession, profileFetchError: true })
    renderGuard(<SetupRoute><Child /></SetupRoute>)
    expect(screen.getByText(/something went wrong loading your profile/i)).toBeInTheDocument()
  })

  it('redirects a member to /home if profile already exists', () => {
    mockAuth({ session: mockSession, profile: memberProfile })
    renderGuard(<SetupRoute><Child /></SetupRoute>)
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('redirects an admin to /adminHome if profile already exists', () => {
    mockAuth({ session: mockSession, profile: adminProfile })
    renderGuard(<SetupRoute><Child /></SetupRoute>)
    expect(screen.getByText('Admin Home Page')).toBeInTheDocument()
  })

  it('renders children when session exists and no profile yet', () => {
    mockAuth({ session: mockSession })
    renderGuard(<SetupRoute><Child /></SetupRoute>)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})

// ── PrivateRoute (/home): member only ────────────────────────────────────────

describe('PrivateRoute', () => {
  it('shows loading screen while auth is resolving', () => {
    mockAuth({ loading: true })
    renderGuard(<PrivateRoute><Child /></PrivateRoute>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to / when there is no session', () => {
    mockAuth()
    renderGuard(<PrivateRoute><Child /></PrivateRoute>)
    expect(screen.getByText('Welcome Page')).toBeInTheDocument()
  })

  it('shows profile fetch error inline', () => {
    mockAuth({ session: mockSession, profileFetchError: true })
    renderGuard(<PrivateRoute><Child /></PrivateRoute>)
    expect(screen.getByText(/something went wrong loading your profile/i)).toBeInTheDocument()
  })

  it('redirects to /setup when session exists but no profile', () => {
    mockAuth({ session: mockSession })
    renderGuard(<PrivateRoute><Child /></PrivateRoute>)
    expect(screen.getByText('Setup Page')).toBeInTheDocument()
  })

  it('redirects an admin to /adminHome', () => {
    mockAuth({ session: mockSession, profile: adminProfile })
    renderGuard(<PrivateRoute><Child /></PrivateRoute>)
    expect(screen.getByText('Admin Home Page')).toBeInTheDocument()
  })

  it('renders children for a member', () => {
    mockAuth({ session: mockSession, profile: memberProfile })
    renderGuard(<PrivateRoute><Child /></PrivateRoute>)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})

// ── AdminRoute (/adminHome): admin only ──────────────────────────────────────

describe('AdminRoute', () => {
  it('shows loading screen while auth is resolving', () => {
    mockAuth({ loading: true })
    renderGuard(<AdminRoute><Child /></AdminRoute>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to / when there is no session', () => {
    mockAuth()
    renderGuard(<AdminRoute><Child /></AdminRoute>)
    expect(screen.getByText('Welcome Page')).toBeInTheDocument()
  })

  it('shows profile fetch error inline', () => {
    mockAuth({ session: mockSession, profileFetchError: true })
    renderGuard(<AdminRoute><Child /></AdminRoute>)
    expect(screen.getByText(/something went wrong loading your profile/i)).toBeInTheDocument()
  })

  it('redirects to /setup when session exists but no profile', () => {
    mockAuth({ session: mockSession })
    renderGuard(<AdminRoute><Child /></AdminRoute>)
    expect(screen.getByText('Setup Page')).toBeInTheDocument()
  })

  it('redirects a member to /home', () => {
    mockAuth({ session: mockSession, profile: memberProfile })
    renderGuard(<AdminRoute><Child /></AdminRoute>)
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('renders children for an admin', () => {
    mockAuth({ session: mockSession, profile: adminProfile })
    renderGuard(<AdminRoute><Child /></AdminRoute>)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })
})
