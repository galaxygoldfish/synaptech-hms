import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { CheckmarkIcon, MailIcon } from './icons'
import type { UserProfile } from '../../types'
import styles from './CheckoutSuccess.module.css'

export default function CheckoutSuccess() {
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
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.content}>
          <div className={styles.successBadge}>
            <CheckmarkIcon size={36} className={styles.successIcon} />
          </div>
          <h1 className={styles.heading}>Success!</h1>
          <p className={styles.subtext}>Your request to check out hardware was submitted successfully</p>
          <p className={styles.subtext}>You can check on the status of your request in My Hardware Loans on the home page</p>

          <p className={styles.footnote}>
            Once your request is approved, you will be notified by email at{' '}
            <span className={styles.emailChip}>
              <MailIcon size={16} />
              {profile?.uw_email}
            </span>
          </p>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} disabled>
            back
          </button>
          <button type="button" className={styles.doneButton} onClick={() => navigate('/home')}>
            done
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
