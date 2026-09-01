import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon } from './icons'
import { SearchField } from './SearchField'
import { InventoryFilterChips } from './InventoryFilterChips'
import { InventoryGroupedList } from './InventoryGroupedList'
import { useInventoryCatalog } from '../../lib/useInventoryCatalog'
import type { UserProfile } from '../../types'
import styles from './BrowseInventory.module.css'

export default function BrowseInventory() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const { isLoading, error, query, setQuery, selectedFilters, toggleFilter, groups } = useInventoryCatalog()

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null
    return {
      name: `${profile.first_name} ${profile.last_name}`,
      role: profile.role === 'admin' ? 'ADMINISTRATOR' : 'MEMBER',
      email: profile.uw_email,
      handle: profile.discord,
      location: profile.address,
    }
  }, [profile])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.searchRow}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/home')} aria-label="Back">
            <ArrowLeftIcon size={22} />
            <span className={styles.backButtonLabel}>Back</span>
          </button>
          <SearchField value={query} onChange={setQuery} placeholder="Search our inventory" />
        </div>

        <InventoryFilterChips selected={selectedFilters} onToggle={toggleFilter} />

        <InventoryGroupedList groups={groups} isLoading={isLoading} error={error} />
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
