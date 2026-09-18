import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { Header } from '../Header'
import { ProfileModal } from '../ProfileModal'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronRightIcon,
  ImagePlaceholderIconFilled,
  PersonIcon,
} from '../icons'
import {
  bucketForLoanItem,
  fetchAllLoanRequestItems,
  type AdminLoanRequestItemSummary,
} from '../../../lib/loanRequests'
import type { UserProfile } from '../../../types'
import { Skeleton, SkeletonScreen } from '../../skeleton/Skeleton'
import styles from './CheckoutHardware.module.css'

/**
 * Picking the loan by hand instead of by barcode — the other way past the
 * camera, for a unit whose label has come off and for a requested item that
 * never had a serial assigned to scan in the first place.
 *
 * Its own screen rather than a trip to "Hardware loans" filtered to
 * Requests: that screen is a record of every loan there has ever been, and
 * what it offers a row depends on the state that row is in. This one exists
 * to complete a hand-off, so it lists only the loans a hand-off can be
 * completed for, and every row does the same thing.
 */

function formatTimestampDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

export default function CheckoutPickLoan() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [loans, setLoans] = useState<AdminLoanRequestItemSummary[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchAllLoanRequestItems()
      .then((items) => {
        if (!cancelled) setLoans(items)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load hardware loans:', fetchError)
        if (!cancelled) setError('Could not load hardware loans. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

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

  // Only loans waiting to be handed over. bucketForLoanItem is the same
  // judgement the dashboard counts and the loans list use, so "waiting to be
  // handed over" can't come to mean something different here.
  const waiting = useMemo(
    () => loans.filter((loan) => bucketForLoanItem(loan) === 'requests'),
    [loans],
  )

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/adminHome/checkout')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Pick a loan request</h1>
          <div />
        </div>

        <div className={styles.pickCard}>
          {isLoading && (
            <SkeletonScreen label="Loading the loans waiting to be handed over…">
              <ul className={styles.pickList}>
                {Array.from({ length: 4 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.pickSkeletonRow}>
                      <Skeleton width="5rem" height="3.5rem" radius="0.5rem" style={{ gridArea: 'thumb' }} />
                      <div
                        style={{
                          gridArea: 'info',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}
                      >
                        <Skeleton width="70%" height="1.5625rem" shape="pill" />
                        <Skeleton width="45%" height="1.25rem" shape="pill" />
                      </div>
                      <Skeleton width="10rem" height="1.25rem" shape="pill" style={{ gridArea: 'member' }} />
                      <Skeleton width="13rem" height="1.25rem" shape="pill" style={{ gridArea: 'date' }} />
                      <Skeleton width="1.25rem" height="1.25rem" shape="pill" style={{ gridArea: 'chevron' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}

          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && waiting.length === 0 && (
            <p className={styles.status}>
              No hardware is waiting to be handed over. Every checkout request has been completed.
            </p>
          )}

          {!isLoading && !error && waiting.length > 0 && (
            <ul className={styles.pickList}>
              {waiting.map((loan) => (
                <li key={loan.id}>
                  <button
                    type="button"
                    className={styles.pickItem}
                    onClick={() =>
                      navigate(`/adminHome/checkout/${loan.id}/agreement`, {
                        state: { serialVerifiedBy: 'database' },
                      })
                    }
                    aria-label={`Hand over ${loan.itemName} to ${loan.memberName}`}
                  >
                    {loan.imageUrl ? (
                      <img src={loan.imageUrl} alt="" className={styles.pickThumb} />
                    ) : (
                      <span className={styles.pickThumbEmpty}>
                        <ImagePlaceholderIconFilled size={24} />
                      </span>
                    )}

                    <div className={styles.pickInfo}>
                      <p className={styles.pickName}>{loan.itemName}</p>
                      {loan.serialNumber ? (
                        <p className={styles.pickSerial}>{loan.serialNumber}</p>
                      ) : (
                        <p className={`${styles.pickSerial} ${styles.pickSerialMissing}`}>
                          No serial assigned
                        </p>
                      )}
                    </div>

                    <div className={styles.pickMember}>
                      <PersonIcon size={20} className={styles.pickRowIcon} />
                      <span>{loan.memberName}</span>
                    </div>

                    <div className={styles.pickDate}>
                      <CalendarIcon size={20} className={styles.pickRowIcon} />
                      <span>Requested on {formatTimestampDate(loan.requestedAt)}</span>
                    </div>

                    <ChevronRightIcon size={20} className={styles.pickChevron} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
