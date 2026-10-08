import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, matchPath, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { preloadInBackground } from './lib/backgroundPreload'
import { PageTransition } from './components/PageTransition'
import { AppShellSkeleton } from './components/skeleton/AppShellSkeleton'
import WelcomePage from './pages/WelcomePage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import HomePage from './pages/HomePage'
import BrowseInventoryPage from './pages/BrowseInventoryPage'
import BrowseInventoryItemPage from './pages/BrowseInventoryItemPage'
import CheckoutSelectHardwarePage from './pages/CheckoutSelectHardwarePage'
import CheckoutConfirmHardwarePage from './pages/CheckoutConfirmHardwarePage'
import CheckoutReturnDatePage from './pages/CheckoutReturnDatePage'
import CheckoutAvailabilityPage from './pages/CheckoutAvailabilityPage'
import CheckoutSuccessPage from './pages/CheckoutSuccessPage'
import MyHardwareLoansPage from './pages/MyHardwareLoansPage'
import MyLoanDetailPage from './pages/MyLoanDetailPage'
import ReturnAvailabilityPage from './pages/ReturnAvailabilityPage'
import AdminHomePage from './pages/AdminHomePage'
import AdminHardwareLoansPage from './pages/AdminHardwareLoansPage'
import AdminLoanDetailPage from './pages/AdminLoanDetailPage'
import AdminHandOffScanPage from './pages/AdminHandOffScanPage'
import AdminViewMembersPage from './pages/AdminViewMembersPage'
import AdminManageInventoryPage from './pages/AdminManageInventoryPage'
import ManageInventoryItemPage from './pages/ManageInventoryItemPage'
import AdminMemberDetailPage from './pages/AdminMemberDetailPage'
import AddInventoryItemPage from './pages/AddInventoryItemPage'
import AddInventoryItemDonePage from './pages/AddInventoryItemDonePage'
import AdminManageUserEmailsPage from './pages/AdminManageUserEmailsPage'
import AdminManageAdminEmailsPage from './pages/AdminManageAdminEmailsPage'
import AdminEmailLogPage from './pages/AdminEmailLogPage'
import AdminReturnHardwarePage from './pages/AdminReturnHardwarePage'
import AdminReturnPickLoanPage from './pages/AdminReturnPickLoanPage'
import AdminReturnConfirmPage from './pages/AdminReturnConfirmPage'
import AdminCheckoutHardwarePage from './pages/AdminCheckoutHardwarePage'
import AdminCheckoutPickLoanPage from './pages/AdminCheckoutPickLoanPage'

// Split into their own chunks: rarely visited, or built around the agreement
// document and label rendering, so most sessions never need their code.
// Everything else stays in the main bundle so ordinary navigation never
// waits on a chunk.
//
// Each chunk is also fetched in the background once the signed-in user's
// role is known (PreloadRoutes, below), so visiting one normally finds its
// code already here and the Suspense fallback never shows.
const memberChunks = {
  checkoutSignAgreement: () => import('./pages/CheckoutSignAgreementPage'),
}
const adminChunks = {
  handOff: () => import('./pages/AdminHandOffPage'),
  auditLog: () => import('./pages/AdminAuditLogPage'),
  inventoryAudit: () => import('./pages/AdminInventoryAuditPage'),
  inventoryAuditScan: () => import('./pages/AdminInventoryAuditScanPage'),
  inventoryAuditReport: () => import('./pages/AdminInventoryAuditReportPage'),
  addItemLabels: () => import('./pages/AddInventoryItemLabelsPage'),
  replacementLabel: () => import('./pages/GetReplacementLabelPage'),
  labelsBrowse: () => import('./pages/GetLabelsBrowsePage'),
  labelsProduct: () => import('./pages/GetLabelsProductPage'),
  editEmailTemplate: () => import('./pages/AdminEditEmailTemplatePage'),
  checkoutAgreement: () => import('./pages/AdminCheckoutAgreementPage'),
}

const CheckoutSignAgreementPage = lazy(memberChunks.checkoutSignAgreement)
const AdminHandOffPage = lazy(adminChunks.handOff)
const AdminAuditLogPage = lazy(adminChunks.auditLog)
const AdminInventoryAuditPage = lazy(adminChunks.inventoryAudit)
const AdminInventoryAuditScanPage = lazy(adminChunks.inventoryAuditScan)
const AdminInventoryAuditReportPage = lazy(adminChunks.inventoryAuditReport)
const AddInventoryItemLabelsPage = lazy(adminChunks.addItemLabels)
const GetReplacementLabelPage = lazy(adminChunks.replacementLabel)
const GetLabelsBrowsePage = lazy(adminChunks.labelsBrowse)
const GetLabelsProductPage = lazy(adminChunks.labelsProduct)
const AdminEditEmailTemplatePage = lazy(adminChunks.editEmailTemplate)
const AdminCheckoutAgreementPage = lazy(adminChunks.checkoutAgreement)

// Fetches the lazy pages this user's role can reach, once, when the browser
// is idle after sign-in — after the first screen has painted, so it never
// competes with it. A failed fetch is ignored here; visiting the page
// retries it (and main.tsx recovers from a deploy in between).
function PreloadRoutes() {
  const { profile } = useAuth()
  const role = profile?.role

  useEffect(() => {
    if (!role) return
    const chunks = Object.values(role === 'admin' ? adminChunks : memberChunks)
    const load = () => preloadInBackground(chunks)
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(load, { timeout: 3000 })
      return () => window.cancelIdleCallback(handle)
    }
    const handle = setTimeout(load, 1500)
    return () => clearTimeout(handle)
  }, [role])

  return null
}

function LoadingScreen() {
  return <AppShellSkeleton />
}

function ProfileFetchError() {
  return <div role="alert">Something went wrong loading your profile. Please refresh and try again.</div>
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

// Every screen used to share the one <title> from index.html, so a
// screen-reader user arriving on a page, or anyone looking through their
// tabs or history, couldn't tell where they were (WCAG 2.4.2). Checked in
// order, so a fixed segment (`audit/new`) has to come before the `:id`
// pattern that would also match it. Keep in step with the routes below —
// router.test.tsx fails if a route has no title here.
export const ROUTE_TITLES: [pattern: string, title: string][] = [
  ['/', 'Sign in'],
  ['/setup', 'Set up your profile'],
  ['/home', 'Home'],
  ['/home/browse', 'Browse inventory'],
  ['/home/browse/item', 'Inventory item'],
  ['/home/loans', 'My hardware loans'],
  ['/home/loans/:id', 'Loan details'],
  ['/home/loans/:id/return', 'Request a return'],
  ['/home/checkout', 'Check out: select hardware'],
  ['/home/checkout/confirm', 'Check out: confirm hardware'],
  ['/home/checkout/return-date', 'Check out: return date'],
  ['/home/checkout/sign-agreement', 'Check out: sign agreement'],
  ['/home/checkout/availability', 'Check out: availability'],
  ['/home/checkout/success', 'Check out: request sent'],
  ['/adminHome', 'Admin home'],
  ['/adminHome/loans', 'Hardware loans'],
  ['/adminHome/loans/:id', 'Loan details'],
  ['/adminHome/loans/:id/hand-off', 'Hand off: scan item'],
  ['/adminHome/loans/:id/hand-off/agreement', 'Hand off: agreement'],
  ['/adminHome/members', 'Members'],
  ['/adminHome/members/:id', 'Member details'],
  ['/adminHome/audit-log', 'Audit log'],
  ['/adminHome/inventory', 'Manage inventory'],
  ['/adminHome/inventory/audit', 'Inventory audits'],
  ['/adminHome/inventory/audit/new', 'New inventory audit'],
  ['/adminHome/inventory/audit/:id', 'Inventory audit report'],
  ['/adminHome/inventory/:id', 'Inventory item'],
  ['/adminHome/add-item', 'Add inventory item'],
  ['/adminHome/add-item/labels', 'Add inventory item: labels'],
  ['/adminHome/add-item/done', 'Add inventory item: done'],
  ['/adminHome/get-labels', 'Get labels'],
  ['/adminHome/get-labels/browse', 'Get labels: browse'],
  ['/adminHome/get-labels/browse/:id', 'Get labels: item'],
  ['/adminHome/emails/user', 'Member emails'],
  ['/adminHome/emails/admin', 'Admin emails'],
  ['/adminHome/emails/log', 'Email log'],
  ['/adminHome/emails/:category/:templateId', 'Edit email template'],
  ['/adminHome/return', 'Return hardware'],
  ['/adminHome/return/pick', 'Return hardware: pick loan'],
  ['/adminHome/return/:id/confirm', 'Return hardware: confirm'],
  ['/adminHome/checkout', 'Check out hardware'],
  ['/adminHome/checkout/pick', 'Check out hardware: pick loan'],
  ['/adminHome/checkout/:id/agreement', 'Check out hardware: agreement'],
]

const APP_TITLE = 'Synaptech HMS'

function RouteTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    const match = ROUTE_TITLES.find(([pattern]) => matchPath(pattern, pathname))
    document.title = match ? `${match[1]} – ${APP_TITLE}` : APP_TITLE
  }, [pathname])

  return null
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <PreloadRoutes />
      <RouteTitle />
      <PageTransition>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<PublicRoute><WelcomePage /></PublicRoute>} />
            <Route path="/setup" element={<SetupRoute><ProfileSetupPage /></SetupRoute>} />
            <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
            <Route path="/home/browse" element={<PrivateRoute><BrowseInventoryPage /></PrivateRoute>} />
            <Route path="/home/browse/item" element={<PrivateRoute><BrowseInventoryItemPage /></PrivateRoute>} />
            <Route path="/home/loans" element={<PrivateRoute><MyHardwareLoansPage /></PrivateRoute>} />
            <Route path="/home/loans/:id" element={<PrivateRoute><MyLoanDetailPage /></PrivateRoute>} />
            <Route path="/home/loans/:id/return" element={<PrivateRoute><ReturnAvailabilityPage /></PrivateRoute>} />
            <Route path="/home/checkout" element={<PrivateRoute><CheckoutSelectHardwarePage /></PrivateRoute>} />
          <Route path="/home/checkout/confirm" element={<PrivateRoute><CheckoutConfirmHardwarePage /></PrivateRoute>} />
          <Route path="/home/checkout/return-date" element={<PrivateRoute><CheckoutReturnDatePage /></PrivateRoute>} />
          <Route path="/home/checkout/sign-agreement" element={<PrivateRoute><CheckoutSignAgreementPage /></PrivateRoute>} />
          <Route path="/home/checkout/availability" element={<PrivateRoute><CheckoutAvailabilityPage /></PrivateRoute>} />
          <Route path="/home/checkout/success" element={<PrivateRoute><CheckoutSuccessPage /></PrivateRoute>} />
            <Route path="/adminHome" element={<AdminRoute><AdminHomePage /></AdminRoute>} />
            <Route path="/adminHome/loans" element={<AdminRoute><AdminHardwareLoansPage /></AdminRoute>} />
            <Route path="/adminHome/loans/:id" element={<AdminRoute><AdminLoanDetailPage /></AdminRoute>} />
            <Route path="/adminHome/loans/:id/hand-off" element={<AdminRoute><AdminHandOffScanPage /></AdminRoute>} />
            <Route path="/adminHome/loans/:id/hand-off/agreement" element={<AdminRoute><AdminHandOffPage /></AdminRoute>} />
            <Route path="/adminHome/members" element={<AdminRoute><AdminViewMembersPage /></AdminRoute>} />
            <Route path="/adminHome/audit-log" element={<AdminRoute><AdminAuditLogPage /></AdminRoute>} />
            <Route path="/adminHome/inventory" element={<AdminRoute><AdminManageInventoryPage /></AdminRoute>} />
            <Route path="/adminHome/inventory/audit" element={<AdminRoute><AdminInventoryAuditPage /></AdminRoute>} />
            {/* "new" is a static segment, so React Router ranks it above the
                :id route below it regardless of their order here. */}
            <Route path="/adminHome/inventory/audit/new" element={<AdminRoute><AdminInventoryAuditScanPage /></AdminRoute>} />
            <Route path="/adminHome/inventory/audit/:id" element={<AdminRoute><AdminInventoryAuditReportPage /></AdminRoute>} />
            <Route path="/adminHome/inventory/:id" element={<AdminRoute><ManageInventoryItemPage /></AdminRoute>} />
            <Route path="/adminHome/members/:id" element={<AdminRoute><AdminMemberDetailPage /></AdminRoute>} />
            <Route path="/adminHome/add-item" element={<AdminRoute><AddInventoryItemPage /></AdminRoute>} />
            <Route path="/adminHome/add-item/labels" element={<AdminRoute><AddInventoryItemLabelsPage /></AdminRoute>} />
            <Route path="/adminHome/add-item/done" element={<AdminRoute><AddInventoryItemDonePage /></AdminRoute>} />
            <Route path="/adminHome/get-labels" element={<AdminRoute><GetReplacementLabelPage /></AdminRoute>} />
            <Route path="/adminHome/get-labels/browse" element={<AdminRoute><GetLabelsBrowsePage /></AdminRoute>} />
            <Route path="/adminHome/get-labels/browse/:id" element={<AdminRoute><GetLabelsProductPage /></AdminRoute>} />
            <Route path="/adminHome/emails/user" element={<AdminRoute><AdminManageUserEmailsPage /></AdminRoute>} />
            <Route path="/adminHome/emails/admin" element={<AdminRoute><AdminManageAdminEmailsPage /></AdminRoute>} />
            <Route path="/adminHome/emails/log" element={<AdminRoute><AdminEmailLogPage /></AdminRoute>} />
            <Route path="/adminHome/emails/:category/:templateId" element={<AdminRoute><AdminEditEmailTemplatePage /></AdminRoute>} />
            <Route path="/adminHome/return" element={<AdminRoute><AdminReturnHardwarePage /></AdminRoute>} />
            <Route path="/adminHome/return/pick" element={<AdminRoute><AdminReturnPickLoanPage /></AdminRoute>} />
            <Route path="/adminHome/return/:id/confirm" element={<AdminRoute><AdminReturnConfirmPage /></AdminRoute>} />
            <Route path="/adminHome/checkout" element={<AdminRoute><AdminCheckoutHardwarePage /></AdminRoute>} />
            <Route path="/adminHome/checkout/pick" element={<AdminRoute><AdminCheckoutPickLoanPage /></AdminRoute>} />
            <Route path="/adminHome/checkout/:id/agreement" element={<AdminRoute><AdminCheckoutAgreementPage /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PageTransition>
    </BrowserRouter>
  )
}
