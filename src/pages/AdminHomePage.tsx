import '../styles.css'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { actionGroups } from '../data/actions'
import { ActionList } from '../components/admin-dashboard/ActionList'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { SearchBar } from '../components/admin-dashboard/SearchBar'
import { StatCards } from '../components/admin-dashboard/StatCards'
import type { DashboardStats, UserProfile } from '../types'

export default function AdminHomePage() {
  const { profile, signOut } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [query, setQuery] = useState('')
  const [isProfileOpen, setProfileOpen] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
      supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'pending_checkout'),
      supabase.from('loans').select('*', { count: 'exact', head: true }).eq('status', 'pending_return'),
    ])
      .then(([active, overdue, pendingReqs, pendingReturns]) => {
        if (cancelled) return
        if (active.error ?? overdue.error ?? pendingReqs.error ?? pendingReturns.error) {
          setError("Couldn't load dashboard stats.")
          return
        }
        setStats({
          activeLoans:     active.count        ?? 0,
          overdueLoans:    overdue.count       ?? 0,
          pendingRequests: pendingReqs.count   ?? 0,
          pendingReturns:  pendingReturns.count ?? 0,
        })
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
    <div className="app-shell">
      <Header userName={user.name} onProfileClick={() => setProfileOpen(true)} />

      <main className="app-main">
        {!isSearching && <StatCards stats={stats} />}

        <SearchBar value={query} onChange={setQuery} />

        <div className="app-main__body">
          <ActionList
            groups={visibleGroups}
            showCategoryLabels={!isSearching}
            onSelect={handleAction}
          />
        </div>
      </main>

      {isProfileOpen && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
