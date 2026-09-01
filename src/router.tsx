import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PageTransition } from './components/PageTransition'
import WelcomePage from './pages/WelcomePage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import HomePage from './pages/HomePage'
import BrowseInventoryPage from './pages/BrowseInventoryPage'
import CheckoutSelectHardwarePage from './pages/CheckoutSelectHardwarePage'
import CheckoutConfirmHardwarePage from './pages/CheckoutConfirmHardwarePage'
import CheckoutReturnDatePage from './pages/CheckoutReturnDatePage'
import CheckoutSignAgreementPage from './pages/CheckoutSignAgreementPage'
import CheckoutAvailabilityPage from './pages/CheckoutAvailabilityPage'
import CheckoutSuccessPage from './pages/CheckoutSuccessPage'
import MyHardwareLoansPage from './pages/MyHardwareLoansPage'
import AdminHomePage from './pages/AdminHomePage'
import AdminHardwareLoansPage from './pages/AdminHardwareLoansPage'
import AdminViewMembersPage from './pages/AdminViewMembersPage'
import AdminManageInventoryPage from './pages/AdminManageInventoryPage'
import ManageInventoryItemPage from './pages/ManageInventoryItemPage'
import AdminMemberDetailPage from './pages/AdminMemberDetailPage'
import AddInventoryItemPage from './pages/AddInventoryItemPage'
import AddInventoryItemLabelsPage from './pages/AddInventoryItemLabelsPage'
import AddInventoryItemDonePage from './pages/AddInventoryItemDonePage'
import GetReplacementLabelPage from './pages/GetReplacementLabelPage'

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
      <PageTransition>
        <Routes>
          <Route path="/" element={<PublicRoute><WelcomePage /></PublicRoute>} />
          <Route path="/setup" element={<SetupRoute><ProfileSetupPage /></SetupRoute>} />
          <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/home/browse" element={<PrivateRoute><BrowseInventoryPage /></PrivateRoute>} />
          <Route path="/home/loans" element={<PrivateRoute><MyHardwareLoansPage /></PrivateRoute>} />
          <Route path="/home/checkout" element={<PrivateRoute><CheckoutSelectHardwarePage /></PrivateRoute>} />
        <Route path="/home/checkout/confirm" element={<PrivateRoute><CheckoutConfirmHardwarePage /></PrivateRoute>} />
        <Route path="/home/checkout/return-date" element={<PrivateRoute><CheckoutReturnDatePage /></PrivateRoute>} />
        <Route path="/home/checkout/sign-agreement" element={<PrivateRoute><CheckoutSignAgreementPage /></PrivateRoute>} />
        <Route path="/home/checkout/availability" element={<PrivateRoute><CheckoutAvailabilityPage /></PrivateRoute>} />
        <Route path="/home/checkout/success" element={<PrivateRoute><CheckoutSuccessPage /></PrivateRoute>} />
          <Route path="/adminHome" element={<AdminRoute><AdminHomePage /></AdminRoute>} />
          <Route path="/adminHome/loans" element={<AdminRoute><AdminHardwareLoansPage /></AdminRoute>} />
          <Route path="/adminHome/members" element={<AdminRoute><AdminViewMembersPage /></AdminRoute>} />
          <Route path="/adminHome/inventory" element={<AdminRoute><AdminManageInventoryPage /></AdminRoute>} />
          <Route path="/adminHome/inventory/:id" element={<AdminRoute><ManageInventoryItemPage /></AdminRoute>} />
          <Route path="/adminHome/members/:id" element={<AdminRoute><AdminMemberDetailPage /></AdminRoute>} />
          <Route path="/adminHome/add-item" element={<AdminRoute><AddInventoryItemPage /></AdminRoute>} />
          <Route path="/adminHome/add-item/labels" element={<AdminRoute><AddInventoryItemLabelsPage /></AdminRoute>} />
          <Route path="/adminHome/add-item/done" element={<AdminRoute><AddInventoryItemDonePage /></AdminRoute>} />
          <Route path="/adminHome/get-labels" element={<AdminRoute><GetReplacementLabelPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageTransition>
    </BrowserRouter>
  )
}
