import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import WelcomePage from './pages/WelcomePage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import HomePage from './pages/HomePage'
import AdminHomePage from './pages/AdminHomePage'

function LoadingScreen() {
  return <div>Loading…</div>
}

function ProfileFetchError() {
  return <div>Something went wrong loading your profile. Please refresh and try again.</div>
}

// Resolves a profiled user to their role-appropriate home route.
function homeFor(role: 'member' | 'admin') {
  return role === 'admin' ? '/adminHome' : '/home'
}

// / — only for unauthenticated users.
// Authenticated users with a profile are sent to their role-appropriate home.
export function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, profileFetchError, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <>{children}</>
  if (profileFetchError) return <ProfileFetchError />
  if (profile) return <Navigate to={homeFor(profile.role)} replace />
  return <Navigate to="/setup" replace />
}

// /setup — only for authenticated users without a profile yet.
// Once a profile exists, sends the user to their role-appropriate home.
export function SetupRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, profileFetchError, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/" replace />
  if (profileFetchError) return <ProfileFetchError />
  if (profile) return <Navigate to={homeFor(profile.role)} replace />
  return <>{children}</>
}

// /home — only for authenticated members (role === 'member').
// Admins who land here are redirected to /adminHome.
export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, profileFetchError, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/" replace />
  if (profileFetchError) return <ProfileFetchError />
  if (!profile) return <Navigate to="/setup" replace />
  if (profile.role === 'admin') return <Navigate to="/adminHome" replace />
  return <>{children}</>
}

// /adminHome — only for authenticated admins (role === 'admin').
// Members who land here are redirected to /home.
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, profileFetchError, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/" replace />
  if (profileFetchError) return <ProfileFetchError />
  if (!profile) return <Navigate to="/setup" replace />
  if (profile.role !== 'admin') return <Navigate to="/home" replace />
  return <>{children}</>
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicRoute><WelcomePage /></PublicRoute>} />
        <Route path="/setup" element={<SetupRoute><ProfileSetupPage /></SetupRoute>} />
        <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
        <Route path="/adminHome" element={<AdminRoute><AdminHomePage /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
