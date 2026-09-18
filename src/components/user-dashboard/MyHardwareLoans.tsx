import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { LoanStatusBadge } from './LoanStatusBadge'
import { SearchField } from './SearchField'
import { AddOnArrowIcon, ArrowLeftIcon, ChevronRightIcon, CognitiveBrainIconFilled } from './icons'
import {
  fetchMemberLoans,
  memberLoanState,
  type MemberLoanGroup,
  type MemberLoanItem,
  type MemberLoanState,
} from '../../lib/memberLoans'
import { useEdgeFade } from '../../lib/useEdgeFade'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './MyHardwareLoans.module.css'

type LoanFilter = 'all' | 'current' | 'past' | 'pending'

const FILTERS: { value: LoanFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'current', label: 'Current' },
  { value: 'past', label: 'Past' },
  { value: 'pending', label: 'Pending' },
]

/**
 * Which chip a state lives under. 'pending' is the one thing still waiting to
 * start; 'current' is anything the member is holding, however late; 'past' is
 * every way a loan can be over, including the two that never began.
 */
const FILTER_FOR_STATE: Record<MemberLoanState, Exclude<LoanFilter, 'all'>> = {
  checkout_requested: 'pending',
  active: 'current',
  return_soon: 'current',
  return_requested: 'current',
  overdue: 'current',
  returned: 'past',
  cancelled: 'past',
  denied: 'past',
}

/** "June 23rd, 2026" — the long form the wireframes use under a row. */
function formatLongDate(iso: string, isDateOnly = false): string {
  const date = isDateOnly ? new Date(`${iso}T00:00:00`) : new Date(iso)
  const day = date.getDate()
  const remainder = day % 100
  const suffix =
    remainder >= 11 && remainder <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th'
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${day}${suffix}, ${date.getFullYear()}`
}

/**
 * The two lines under a row's badges: when the member got it, and what
 * happens next. A request that hasn't been handed over has neither — the
 * badge already carries the only date it has.
 */
function dateLines(item: MemberLoanItem, state: MemberLoanState): string[] {
  if (state === 'checkout_requested' || state === 'cancelled' || state === 'denied') return []

  // reviewed_at is when an admin approved and handed it over. Older rows
  // approved before that was recorded fall back to the request date rather
  // than showing nothing.
  const checkedOut = `Checked out on ${formatLongDate(item.reviewedAt ?? item.requestedAt)}`

  if (state === 'returned' && item.returnedAt) {
    return [checkedOut, `Returned on ${formatLongDate(item.returnedAt)}`]
  }
  // Consumables are kept, so there is nothing to be due.
  if (!item.returnDate) return [checkedOut, 'Return not required']
  return [checkedOut, `Return by ${formatLongDate(item.returnDate, true)}`]
}

export default function MyHardwareLoans() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [groups, setGroups] = useState<MemberLoanGroup[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LoanFilter>('all')
  const [query, setQuery] = useState('')

  const { ref: chipRowRef, maskImage: chipRowMaskImage } = useEdgeFade<HTMLDivElement>()

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    fetchMemberLoans(profile.id)
      .then((items) => {
        if (!cancelled) setGroups(items)
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

  /**
   * A request shows if anything in it matches the chip, and then shows whole.
   *
   * Matching on any item rather than on the primary is deliberate: returns
   * are recorded per item, so a request can be half back — and filtering on
   * the primary alone would hide an add-on still out under "Current" once the
   * main item had been returned. Showing the group whole keeps an add-on
   * readable as what it is: something that came with the item above it.
   */
  const visibleGroups = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return groups.filter((group) => {
      const items = [group.primary, ...group.addOns]
      const matchesFilter =
        filter === 'all' || items.some((item) => FILTER_FOR_STATE[memberLoanState(item)] === filter)
      if (!matchesFilter) return false
      if (!trimmed) return true
      // Searching the whole request, not each row: typing the name of an
      // add-on should find the loan it belongs to, not strand it under a
      // primary item that has been filtered away.
      return items.some((item) =>
        [item.itemName, item.serialNumber ?? ''].join(' ').toLowerCase().includes(trimmed),
      )
    })
  }, [groups, filter, query])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  const emptyMessage = query.trim()
    ? 'No hardware loans match your search'
    : filter === 'all'
      ? "You don't have any hardware loans"
      : `You don't have any ${filter} hardware loans`

  /** One row. Add-ons render the same way, indented and without the button. */
  function LoanRow({ item, isAddOn }: { item: MemberLoanItem; isAddOn: boolean }) {
    const state = memberLoanState(item)
    const lines = dateLines(item, state)
    // A consumable is kept rather than borrowed, so there is no loan of it to
    // open — the row is a statement, not a link.
    const canOpenDetail = !(isAddOn && item.isConsumable)

    const body = (
      <>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className={styles.loanThumb} />
        ) : (
          <span className={styles.loanThumbEmpty} />
        )}

        <div className={styles.loanInfo}>
          <p className={styles.loanName}>{item.itemName}</p>
          {lines.map((line) => (
            <p className={styles.loanDate} key={line}>
              {line}
            </p>
          ))}
        </div>

        <div className={styles.badgeRow}>
          {isAddOn && <span className={styles.tagBadge}>ADD-ON</span>}
          {item.isConsumable && <span className={styles.tagBadge}>Consumable</span>}
          <LoanStatusBadge state={state} item={item} />
        </div>

        <div className={styles.loanActions}>
          {canOpenDetail && <ChevronRightIcon size={20} />}
        </div>
      </>
    )

    if (!canOpenDetail) {
      return <div className={`${styles.loanItem} ${styles.loanItemStatic}`}>{body}</div>
    }

    return (
      <button
        type="button"
        className={styles.loanItem}
        onClick={() => navigate(`/home/loans/${item.id}`)}
        aria-label={`View details for ${item.itemName}`}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/home')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>My hardware loans</h1>
          <div />
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.searchWrap}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search your hardware loans"
              />
            </div>
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

          {isLoading && (
            <SkeletonScreen label="Loading your loans…">
              <ul className={styles.loanList}>
                {Array.from({ length: 3 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.skeletonRow}>
                      <Skeleton width="5.625rem" height="3.75rem" radius="0.625rem" />
                      <div className={styles.skeletonInfo}>
                        <Skeleton width="55%" height="1.75rem" shape="pill" />
                        <Skeleton width="9rem" height="1.5rem" shape="pill" />
                        <Skeleton width="40%" height="0.9375rem" shape="pill" />
                      </div>
                      <Skeleton width="1.25rem" height="1.25rem" shape="pill" />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}

          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && visibleGroups.length === 0 && (
            <div className={styles.empty}>
              <CognitiveBrainIconFilled size={145} className={styles.emptyIcon} />
              <p className={styles.emptyText}>{emptyMessage}</p>
            </div>
          )}

          {!isLoading && !error && visibleGroups.length > 0 && (
            <ul className={styles.loanList}>
              {visibleGroups.map((group) => (
                <li key={group.loanRequestId} className={styles.loanGroup}>
                  <LoanRow item={group.primary} isAddOn={false} />

                  {group.addOns.map((addOn) => (
                    <div className={styles.addOnRow} key={addOn.id}>
                      {/* The elbow that ties an add-on to the item above it.
                          Decorative: the ADD-ON badge says the same thing to
                          anyone not looking at the picture. */}
                      <AddOnArrowIcon className={styles.addOnArrow} />
                      <LoanRow item={addOn} isAddOn />
                    </div>
                  ))}
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
