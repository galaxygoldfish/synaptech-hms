import '../styles.css'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { ArrowLeftIcon } from '../components/admin-dashboard/icons'
import type { UserProfile } from '../types'
import styles from './AdminInventoryAuditPage.module.css'

export default function AdminInventoryAuditPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

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
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.topBackButton}
          onClick={() => navigate('/adminHome')}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>
        <h1 className={styles.heading}>Perform inventory audit</h1>
        <div />
      </div>

      <main className={styles.main}>
        <p className={styles.subtext}>Inventory audits are coming soon.</p>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
