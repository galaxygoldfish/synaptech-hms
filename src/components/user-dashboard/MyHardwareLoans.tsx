import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon, ChevronRightIcon, CognitiveBrainIconFilled } from './icons'
import { fetchLoanRequestItems, type LoanRequestItemSummary } from '../../lib/loanRequests'
import { useEdgeFade } from '../../lib/useEdgeFade'
import type { LoanRequestStatus, UserProfile } from '../../types'
import styles from './MyHardwareLoans.module.css'

type LoanFilter = 'all' | 'current' | 'past' | 'pending'

const FILTERS: { value: LoanFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'current', label: 'Current' },
  { value: 'past', label: 'Past' },
  { value: 'pending', label: 'Pending' },
]

const STATUS_BADGE_CLASS: Record<LoanRequestStatus, string> = {
  pending: styles.badgePending,
  approved: styles.badgeApproved,
  denied: styles.badgeDenied,
}

function bucketFor(status: LoanRequestStatus): Exclude<LoanFilter, 'all'> {
  if (status === 'pending') return 'pending'
  if (status === 'denied') return 'past'
  return 'current' // approved
}

function statusLabel(loan: LoanRequestItemSummary): string {
  if (loan.status === 'pending') return `Checkout requested on ${formatShortDate(loan.requestedAt)}`
  if (loan.status === 'approved') return 'Approved'
  return 'Not approved'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: '2-digit', year: 'numeric' })
}

// "6.23.26" — matches the wireframe's compact requested-on date format.
function formatShortDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear() % 100}`
}

export default function MyHardwareLoans() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [loans, setLoans] = useState<LoanRequestItemSummary[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LoanFilter>('all')

  const { ref: chipRowRef, maskImage: chipRowMaskImage } = useEdgeFade<HTMLDivElement>()

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    fetchLoanRequestItems(profile.id)
      .then((items) => {
        if (!cancelled) setLoans(items)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load hardware loans:', fetchError)
        if (!cancelled) setError('Could not load your hardware loans. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [profile])

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

  const filteredLoans = useMemo<LoanRequestItemSummary[]>(() => {
    if (filter === 'all') return loans
    return loans.filter((loan) => bucketFor(loan.status) === filter)
  }, [loans, filter])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function handleMoreDetails() {
    // Placeholder: wire this up to a loan detail screen once it's built.
    // eslint-disable-next-line no-console
    console.log('Navigate to: loan details')
  }

  const emptyMessage =
    filter === 'all' ? "You don't have any hardware loans" : `You don't have any ${filter} hardware loans`

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/home')} aria-label="Back">
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>My hardware loans</span>
            <div
              ref={chipRowRef}
              className={styles.chipRow}
              style={{ WebkitMaskImage: chipRowMaskImage, maskImage: chipRowMaskImage }}
            >
              {FILTERS.map((option) => {
                const isActive = filter === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={isActive ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                    onClick={() => setFilter(option.value)}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {isLoading && <p className={styles.status}>Loading your loans…</p>}
          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && filteredLoans.length === 0 && (
            <div className={styles.empty}>
              <CognitiveBrainIconFilled size={145} className={styles.emptyIcon} />
              <p className={styles.emptyText}>{emptyMessage}</p>
            </div>
          )}

          {!isLoading && !error && filteredLoans.length > 0 && (
            <ul className={styles.loanList}>
              {filteredLoans.map((loan) => (
                <li key={loan.id}>
                  <button type="button" className={styles.loanItem} onClick={handleMoreDetails}>
                    {loan.imageUrl && <img src={loan.imageUrl} alt="" className={styles.loanThumb} />}
                    <div className={styles.loanInfo}>
                      <p className={styles.loanName}>{loan.itemName}</p>
                      <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[loan.status]}`}>
                        {statusLabel(loan)}
                      </span>
                      {loan.status === 'approved' && loan.returnDate && (
                        <p className={styles.loanDate}>Return by {formatDate(loan.returnDate)}</p>
                      )}
                      <span className={styles.moreDetailsMobile}>
                        More details
                        <ChevronRightIcon size={14} />
                      </span>
                    </div>
                    <ChevronRightIcon size={20} className={styles.chevronDesktop} />
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
