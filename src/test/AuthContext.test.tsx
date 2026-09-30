import { act, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { refresh } from '../lib/queryCache'
import { supabase } from '../lib/supabase'

type AuthCallback = (event: string, session: Session | null) => void
let emit: AuthCallback = () => {}

const single = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        emit = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
  },
}))

function session(userId: string): Session {
  return { user: { id: userId, email: `${userId}@uw.edu` } } as unknown as Session
}

function profileRow(userId: string) {
  return { id: userId, first_name: 'Jane', last_name: 'Smith', role: 'member' }
}

function ProfileName() {
  const { profile, loading } = useAuth()
  return <p>{loading ? 'loading' : (profile?.id ?? 'none')}</p>
}

beforeEach(() => {
  single.mockReset()
  single.mockImplementation(() => Promise.resolve({ data: profileRow('user-1'), error: null }))
})

describe('AuthProvider', () => {
  // onAuthStateChange fires INITIAL_SESSION, SIGNED_IN and TOKEN_REFRESHED
  // for one sign-in; each used to refetch the same profile row.
  it('fetches the profile once per user, not once per auth event', async () => {
    render(
      <AuthProvider>
        <ProfileName />
      </AuthProvider>,
    )

    await act(async () => {
      emit('INITIAL_SESSION', session('user-1'))
      emit('SIGNED_IN', session('user-1'))
    })
    await waitFor(() => expect(screen.getByText('user-1')).toBeInTheDocument())
    await act(async () => {
      emit('TOKEN_REFRESHED', session('user-1'))
    })

    expect(single).toHaveBeenCalledTimes(1)
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('profiles')
  })

  it('refetches after a failed profile load', async () => {
    single.mockImplementationOnce(() => Promise.resolve({ data: null, error: { code: '500' } }))
    render(
      <AuthProvider>
        <ProfileName />
      </AuthProvider>,
    )

    await act(async () => {
      emit('INITIAL_SESSION', session('user-1'))
    })
    await act(async () => {
      emit('TOKEN_REFRESHED', session('user-1'))
    })

    await waitFor(() => expect(screen.getByText('user-1')).toBeInTheDocument())
    expect(single).toHaveBeenCalledTimes(2)
  })

  // Cached reads belong to whoever was signed in when they were made.
  it('clears cached reads on sign-out', async () => {
    render(
      <AuthProvider>
        <ProfileName />
      </AuthProvider>,
    )
    await act(async () => {
      emit('INITIAL_SESSION', session('user-1'))
    })

    const fetcher = vi.fn().mockResolvedValue('admin data')
    await refresh('admin-loans', fetcher, 60_000)
    await act(async () => {
      emit('SIGNED_OUT', null)
    })
    await refresh('admin-loans', fetcher, 60_000)

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
