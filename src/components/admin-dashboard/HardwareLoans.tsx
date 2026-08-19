import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon, CalendarIcon, ChevronRightIcon, PersonIcon } from './icons'
import {
  bucketForLoanItem,
  fetchAllLoanRequestItems,
  type AdminLoanRequestItemSummary,
  type LoanBucket,
} from '../../lib/loanRequests'
import type { UserProfile } from '../../types'
import styles from './HardwareLoans.module.css'

type LoanFilter = 'all' | LoanBucket

const FILTERS: { value: LoanFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'requests', label: 'Requests' },
  { value: 'returns', label: 'Returns' },
]

const FILTER_VALUES = FILTERS.map((f) => f.value)

function parseFilter(value: string | null): LoanFilter {
  return (FILTER_VALUES as string[]).includes(value ?? '') ? (value as LoanFilter) : 'all'
}

const BADGE_CLASS: Record<LoanBucket, string> = {
  active: styles.badgeActive,
  overdue: styles.badgeOverdue,
  requests: styles.badgeRequests,
  returns: styles.badgeReturns,
}

const BADGE_LABEL: Record<LoanBucket, string> = {
  active: 'Active',
  overdue: 'Overdue',
  requests: 'Checkout requested',
  returns: 'Return requested',
}

function formatTimestampDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${date.getDate()} ${date.getFullYear()}`
}

function formatCalendarDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${date.getDate()} ${date.getFullYear()}`
}

function dateText(loan: AdminLoanRequestItemSummary, bucket: LoanBucket | null): string {
  if (bucket === 'requests') return `Requested on ${formatTimestampDate(loan.requestedAt)}`
  if (loan.returnDate) return `${formatTimestampDate(loan.requestedAt)} - ${formatCalendarDate(loan.returnDate)}`
  return formatTimestampDate(loan.requestedAt)
}

export default function HardwareLoans() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [loans, setLoans] = useState<AdminLoanRequestItemSummary[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LoanFilter>(() => parseFilter(searchParams.get('filter')))

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

  const visibleLoans = useMemo(() => {
    return loans
      .map((loan) => ({ loan, bucket: bucketForLoanItem(loan) }))
      .filter((entry): entry is { loan: AdminLoanRequestItemSummary; bucket: LoanBucket } => {
        if (entry.bucket === null) return false
        return filter === 'all' || entry.bucket === filter
      })
  }, [loans, filter])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function handleRowClick() {
    // Placeholder: wire this up to a loan detail/review screen once it's built.
    // eslint-disable-next-line no-console
    console.log('Navigate to: loan detail')
  }

  const emptyMessage =
    filter === 'all' ? 'There are no hardware loans yet' : `There are no ${filter} hardware loans`

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <button type="button" className={styles.backButton} onClick={() => navigate('/adminHome')} aria-label="Back">
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>Hardware loans</span>
            <div className={styles.chipRow}>
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

          {isLoading && <p className={styles.status}>Loading…</p>}
          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && visibleLoans.length === 0 && (
            <p className={styles.status}>{emptyMessage}</p>
          )}

          {!isLoading && !error && visibleLoans.length > 0 && (
            <ul className={styles.loanList}>
              {visibleLoans.map(({ loan, bucket }) => (
                <li key={loan.id}>
                  <button type="button" className={styles.loanItem} onClick={handleRowClick}>
                    {loan.imageUrl && <img src={loan.imageUrl} alt="" className={styles.loanThumb} />}

                    <div className={styles.loanInfo}>
                      <p className={styles.loanName}>{loan.itemName}</p>
                      {loan.serialNumber && <p className={styles.loanSerial}>{loan.serialNumber}</p>}
                    </div>

                    <div className={styles.loanBadgeWrap}>
                      <span className={`${styles.statusBadge} ${BADGE_CLASS[bucket]}`}>{BADGE_LABEL[bucket]}</span>
                    </div>

                    <div className={styles.loanMember}>
                      <PersonIcon size={20} className={styles.loanMemberIcon} />
                      <span>{loan.memberName}</span>
                    </div>

                    <div className={styles.loanDateWrap}>
                      <CalendarIcon size={20} className={styles.loanDateIcon} />
                      <span>{dateText(loan, bucket)}</span>
                    </div>

                    <ChevronRightIcon size={20} className={styles.loanChevron} />
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
