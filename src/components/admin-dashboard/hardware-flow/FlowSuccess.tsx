import { useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { Header } from '../Header'
import { ProfileModal } from '../ProfileModal'
import { CheckmarkCircleIconFilled } from '../icons'
import type { UserProfile } from '../../../types'
import styles from './HardwareFlow.module.css'

/**
 * The end of a desk flow. Deliberately the same shape as the "Successfully
 * added to inventory" screen the add-item flow finishes on: a mark, a
 * sentence saying what happened, and one way out.
 */

interface FlowSuccessProps {
  heading: string
  /**
   * The specifics — which unit, and who it went to or came back from. One
   * line per sentence: what happened to the hardware and what happened to
   * the member are two different facts, and running them together made a
   * paragraph to read rather than two things to take in.
   */
  detail: string[]
  doneLabel?: string
  onDone: () => void
}

export function FlowSuccess({ heading, detail, doneLabel = 'done', onDone }: FlowSuccessProps) {
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
    <div className={styles.successPage}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.successMain}>
        <CheckmarkCircleIconFilled className={styles.successCheckmark} />
        <h1 className={styles.successHeading}>{heading}</h1>
        <div className={styles.successDetailGroup}>
          {detail.map((line) => (
            <p className={styles.successDetail} key={line}>
              {line}
            </p>
          ))}
        </div>
        <button type="button" className={styles.successDoneButton} onClick={onDone}>
          {doneLabel}
        </button>
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
