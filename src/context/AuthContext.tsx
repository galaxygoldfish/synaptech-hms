import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isUWEmail } from '../lib/auth'
import type { Profile } from '../types'

interface AuthContextType {
  session: Session | null
  profile: Profile | null
  loading: boolean
  accountError: boolean
  profileFetchError: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (profile: Profile) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [accountError, setAccountError] = useState(false)
  const [profileFetchError, setProfileFetchError] = useState(false)

  async function handleSession(incomingSession: Session | null) {
    if (!incomingSession) {
      setSession(null)
      setProfile(null)
      setLoading(false)
      // accountError is intentionally not cleared here — a sign-out triggered
      // by a bad-domain account should keep the error visible until the user
      // explicitly retries via signInWithGoogle().
      return
    }

    const email = incomingSession.user.email ?? ''
    if (!isUWEmail(email)) {
      setAccountError(true)
      await supabase.auth.signOut()
      // onAuthStateChange will fire again with null, which calls handleSession(null)
      // and sets loading: false.
      return
    }

    setSession(incomingSession)
    setAccountError(false)
    setProfileFetchError(false)

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', incomingSession.user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // PostgREST "0 rows" — expected for first-time users, not an error.
        setProfile(null)
      } else {
        // Network failure, RLS rejection, or any other unexpected error.
        // Do NOT treat as "no profile" — routing to /setup would be wrong.
        setProfileFetchError(true)
        setProfile(null)
      }
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, incomingSession) => {
        handleSession(incomingSession)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function signInWithGoogle() {
    setAccountError(false)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  function updateProfile(newProfile: Profile) {
    setProfile(newProfile)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, accountError, profileFetchError, signInWithGoogle, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
