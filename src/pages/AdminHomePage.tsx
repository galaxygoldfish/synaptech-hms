import '../styles.css'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { bucketForLoanItem, fetchAllLoanRequestItems } from '../lib/loanRequests'
import { actionGroups } from '../data/actions'
import { ActionList } from '../components/admin-dashboard/ActionList'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { SearchBar } from '../components/admin-dashboard/SearchBar'
import { StatCards } from '../components/admin-dashboard/StatCards'
import type { DashboardStats, UserProfile } from '../types'
import styles from '../components/admin-dashboard/AdminHome.module.css'

export default function AdminHomePage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [query, setQuery] = useState('')
  const [isProfileOpen, setProfileOpen] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchAllLoanRequestItems()
      .then((items) => {
        if (cancelled) return
        const counts = { activeLoans: 0, overdueLoans: 0, pendingRequests: 0, pendingReturns: 0 }
        for (const item of items) {
          const bucket = bucketForLoanItem(item)
          if (bucket === 'active') counts.activeLoans += 1
          else if (bucket === 'overdue') counts.overdueLoans += 1
          else if (bucket === 'requests') counts.pendingRequests += 1
          else if (bucket === 'returns') counts.pendingReturns += 1
        }
        setStats(counts)
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the dashboard.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null
    return {
      name:     `${profile.first_name} ${profile.last_name}`,
      role:     profile.role === 'admin' ? 'ADMINISTRATOR' : 'MEMBER',
      email:    profile.uw_email,
      handle:   profile.discord,
      location: profile.address,
    }
  }, [profile])

  const visibleGroups = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return actionGroups
    return actionGroups
      .map(group => ({
        category: group.category,
        items: group.items.filter(item => item.label.toLowerCase().includes(trimmed)),
      }))
      .filter(group => group.items.length > 0)
  }, [query])

  const isSearching = query.trim().length > 0

  const handleAction = (actionId: string) => {
    if (actionId === 'manage-inventory') {
      navigate('/adminHome/inventory')
      return
    }
    if (actionId === 'add-item') {
      navigate('/adminHome/add-item')
      return
    }
    if (actionId === 'view-loans') {
      navigate('/adminHome/loans')
      return
    }
    if (actionId === 'view-members') {
      navigate('/adminHome/members')
      return
    }
    if (actionId === 'get-labels') {
      navigate('/adminHome/get-labels')
      return
    }
    // eslint-disable-next-line no-console
    console.log('Navigate to action:', actionId)
  }

  const handleLogOut = () => {
    setProfileOpen(false)
    signOut()
  }

  if (isLoading) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text">Loading dashboard…</p>
      </div>
    )
  }

  if (error || !stats || !user) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text status-text--error">{error ?? 'Something went wrong.'}</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Header userName={user.name} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        {!isSearching && <StatCards stats={stats} />}

        <SearchBar value={query} onChange={setQuery} />

        <ActionList
          groups={visibleGroups}
          showCategoryLabels={!isSearching}
          onSelect={handleAction}
        />
      </main>

      {isProfileOpen && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
