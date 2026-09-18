import { useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { Header } from '../Header'
import { ProfileModal } from '../ProfileModal'
import { ArrowLeftIcon } from '../icons'
import type { UserProfile } from '../../../types'
import styles from './HardwareFlow.module.css'

/**
 * The chrome every step of the checkout and return flows sits in: the app
 * header with its profile modal, and the three-column top row that pins Back
 * left and centres the heading — the same one the loan detail, email log and
 * audit log screens use.
 */

interface FlowPageProps {
  heading: string
  onBack: () => void
  children: ReactNode
}

export function FlowPage({ heading, onBack, children }: FlowPageProps) {
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

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back">
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>{heading}</h1>
          <div />
        </div>

        {children}
      </main>

      {isProfileOpen && user && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onLogOut={() => {
            setProfileOpen(false)
            signOut()
          }}
        />
      )}
    </div>
  )
}
