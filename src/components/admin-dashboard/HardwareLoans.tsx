import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, CalendarIcon, ChevronRightIcon, PersonIcon } from './icons'
import {
  bucketForLoanItem,
  fetchAllLoanRequestItems,
  type AdminLoanRequestItemSummary,
  type LoanBucket,
} from '../../lib/loanRequests'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './HardwareLoans.module.css'

type LoanFilter = 'all' | 'active' | 'overdue' | 'requests' | 'returned'

/**
 * The chips, and the buckets each one covers.
 *
 * Checkout requests and return requests share the "Requests" chip: they are
 * the same thing to an admin working this screen — a member waiting on them
 * to do something — and which of the two it is, is already on the row's own
 * badge. Two chips made an admin check both to find everything waiting.
 */
const FILTERS: { value: LoanFilter; label: string; buckets: LoanBucket[]; emptyLabel: string }[] = [
  {
    value: 'all',
    label: 'All',
    buckets: ['active', 'overdue', 'requests', 'returns', 'returned'],
    emptyLabel: 'hardware loans yet',
  },
  { value: 'active', label: 'Active', buckets: ['active'], emptyLabel: 'active hardware loans' },
  { value: 'overdue', label: 'Overdue', buckets: ['overdue'], emptyLabel: 'overdue hardware loans' },
  {
    value: 'requests',
    label: 'Requests',
    buckets: ['requests', 'returns'],
    emptyLabel: 'requests waiting on an admin',
  },
  {
    value: 'returned',
    label: 'Returned',
    buckets: ['returned'],
    emptyLabel: 'returned hardware loans',
  },
]

const FILTER_BY_VALUE = new Map(FILTERS.map((option) => [option.value, option]))

function parseFilter(value: string | null): LoanFilter {
  // 'returns' was its own chip before the two request kinds were merged. The
  // dashboard's "Pending returns" card still links with it, and so may a
  // bookmark, so it resolves to the chip that now covers it rather than
  // silently falling back to All.
  if (value === 'returns') return 'requests'
  return FILTER_BY_VALUE.has(value as LoanFilter) ? (value as LoanFilter) : 'all'
}

function matchesQuery(loan: AdminLoanRequestItemSummary, query: string): boolean {
  const haystack = [loan.itemName, loan.serialNumber ?? '', loan.memberName].join(' ').toLowerCase()
  return haystack.includes(query)
}

const BADGE_CLASS: Record<LoanBucket, string> = {
  active: styles.badgeActive,
  overdue: styles.badgeOverdue,
  requests: styles.badgeRequests,
  returns: styles.badgeReturns,
  returned: styles.badgeReturned,
}

const BADGE_LABEL: Record<LoanBucket, string> = {
  active: 'Active',
  overdue: 'Overdue',
  requests: 'Checkout requested',
  returns: 'Return requested',
  returned: 'Returned',
}

function formatTimestampDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

function formatCalendarDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

function dateText(loan: AdminLoanRequestItemSummary, bucket: LoanBucket | null): string {
  if (bucket === 'requests') return `Requested on ${formatTimestampDate(loan.requestedAt)}`
  // A closed loan's due date stopped mattering the moment it came back, so
  // the row shows when that was instead.
  if (bucket === 'returned' && loan.returnedAt) return `Returned on ${formatTimestampDate(loan.returnedAt)}`
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
  const [query, setQuery] = useState('')

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
    const trimmed = query.trim().toLowerCase()
    const buckets = FILTER_BY_VALUE.get(filter)?.buckets ?? []
    return loans
      .map((loan) => ({ loan, bucket: bucketForLoanItem(loan) }))
      .filter((entry): entry is { loan: AdminLoanRequestItemSummary; bucket: LoanBucket } => {
        if (entry.bucket === null) return false
        if (!buckets.includes(entry.bucket)) return false
        return !trimmed || matchesQuery(entry.loan, trimmed)
      })
  }, [loans, filter, query])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function handleRowClick(loan: AdminLoanRequestItemSummary) {
    navigate(`/adminHome/loans/${loan.id}`)
  }

  const emptyMessage = query.trim()
    ? 'No hardware loans match your search'
    : `There are no ${FILTER_BY_VALUE.get(filter)?.emptyLabel ?? 'hardware loans yet'}`

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/adminHome')} aria-label="Back">
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Hardware loans</h1>
          <div />
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.searchWrap}>
              <SearchBar value={query} onChange={setQuery} placeholder="Search by item, serial or member" />
            </div>
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

          {isLoading && (
            <SkeletonScreen label="Loading hardware loans…">
              <ul className={styles.loanList}>
                {Array.from({ length: 5 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.skeletonRow}>
                      {/* .loanThumb so it drops out on phone with the real
                          thumbnail — the 'thumb' area doesn't exist there. */}
                      <Skeleton
                        width="5rem"
                        height="3.5rem"
                        radius="0.5rem"
                        style={{ gridArea: 'thumb' }}
                        className={styles.loanThumb}
                      />
                      <div style={{ gridArea: 'info', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div className={styles.loanNameRow}>
                          <Skeleton width="9rem" height="1.5625rem" shape="pill" />
                          {/* Mirrors the inline badge the real row shows below
                              1200px, so loading doesn't reflow once it lands. */}
                          <Skeleton width="6rem" height="1.5rem" shape="pill" className={styles.statusBadgeInline} />
                        </div>
                        <Skeleton width="45%" height="1.25rem" shape="pill" />
                      </div>
                      <Skeleton
                        width="7.5rem"
                        height="2rem"
                        shape="pill"
                        style={{ gridArea: 'badge' }}
                        className={styles.loanBadgeWrap}
                      />
                      <div className={styles.loanMeta}>
                        <Skeleton width="10rem" height="1.25rem" shape="pill" style={{ gridArea: 'member' }} />
                        <Skeleton width="13rem" height="1.25rem" shape="pill" style={{ gridArea: 'date' }} />
                      </div>
                      <Skeleton width="1.25rem" height="1.25rem" shape="pill" style={{ gridArea: 'chevron' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}
          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && visibleLoans.length === 0 && (
            <p className={styles.status}>{emptyMessage}</p>
          )}

          {!isLoading && !error && visibleLoans.length > 0 && (
            <ul className={styles.loanList}>
              {visibleLoans.map(({ loan, bucket }) => (
                <li key={loan.id}>
                  <button
                    type="button"
                    className={styles.loanItem}
                    onClick={() => handleRowClick(loan)}
                    aria-label={`View loan details for ${loan.itemName}`}
                  >
                    {loan.imageUrl && <img src={loan.imageUrl} alt="" className={styles.loanThumb} />}

                    <div className={styles.loanInfo}>
                      <div className={styles.loanNameRow}>
                        <p className={styles.loanName}>{loan.itemName}</p>
                        {/* Below 1200px the badge moves into this row, next to the
                            name it describes, instead of the desktop column below —
                            see .loanBadgeWrap's display:none at that breakpoint. */}
                        <span
                          className={`${styles.statusBadge} ${styles.statusBadgeInline} ${BADGE_CLASS[bucket]}`}
                        >
                          {BADGE_LABEL[bucket]}
                        </span>
                      </div>
                      {loan.serialNumber && <p className={styles.loanSerial}>{loan.serialNumber}</p>}
                    </div>

                    <div className={styles.loanBadgeWrap}>
                      <span className={`${styles.statusBadge} ${BADGE_CLASS[bucket]}`}>{BADGE_LABEL[bucket]}</span>
                    </div>

                    {/* `display: contents` on desktop, so these two stay their
                        own grid columns there; a real flex pair below 1200px. */}
                    <div className={styles.loanMeta}>
                      <div className={styles.loanMember}>
                        <PersonIcon size={20} className={styles.loanMemberIcon} />
                        <span>{loan.memberName}</span>
                      </div>

                      <div className={styles.loanDateWrap}>
                        <CalendarIcon size={20} className={styles.loanDateIcon} />
                        <span>{dateText(loan, bucket)}</span>
                      </div>
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
