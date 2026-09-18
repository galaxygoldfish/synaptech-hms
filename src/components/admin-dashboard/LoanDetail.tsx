import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AvailabilityModal } from './AvailabilityModal'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronRightIcon,
  DownloadIconFilled,
  ImagePlaceholderIconFilled,
} from './icons'
import {
  bucketForLoanItem,
  fetchLoanRequestItemDetail,
  fetchSignedAgreementUrl,
  type AdminLoanRequestDetail,
  type LoanBucket,
} from '../../lib/loanRequests'
import type { LoanRequestItemRole, UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './LoanDetail.module.css'

// Every state a loan can be in from this screen's point of view. A denied
// request has no bucket (it never became a loan, so it's kept out of the
// list and the stat cards), but it's still a real record someone can land
// on by URL — showing it plainly beats showing nothing.
type LoanState = LoanBucket | 'denied'

const BADGE_CLASS: Record<LoanState, string> = {
  active: styles.badgeActive,
  overdue: styles.badgeOverdue,
  requests: styles.badgeRequests,
  returns: styles.badgeReturns,
  returned: styles.badgeReturned,
  denied: styles.badgeDenied,
}

const BADGE_LABEL: Record<LoanState, string> = {
  active: 'Active',
  overdue: 'Overdue',
  requests: 'Checkout requested',
  returns: 'Return requested',
  returned: 'Returned',
  denied: 'Denied',
}

const ROLE_LABEL: Record<LoanRequestItemRole, string> = {
  primary: 'Primary item',
  optional_addon: 'Optional add-on',
  required_addon: 'Required add-on',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${date.getDate()} ${date.getFullYear()}`
}

function formatCalendarDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${date.getDate()} ${date.getFullYear()}`
}

interface DetailRowProps {
  label: string
  value: string
}

// The rows that are always present once the loan loads; the conditional
// ones (return date, reviewer, note) are left out so the skeleton never
// promises more than the record may hold.
const LOAN_DETAIL_LABELS = ['Member', 'Member email', 'Requested'] as const
const SKELETON_VALUE_WIDTHS = ['10rem', '14rem', '12rem']

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [detail, setDetail] = useState<AdminLoanRequestDetail | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isDownloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [isAvailabilityOpen, setAvailabilityOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDownloadError(null)

    fetchLoanRequestItemDetail(id)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load loan:', fetchError)
        if (!cancelled) setError('Could not load this loan. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

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

  const bucket = detail ? bucketForLoanItem(detail) : null
  // bucketForLoanItem returns null only for a denied request.
  const state: LoanState | null = detail ? (bucket ?? 'denied') : null

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  async function handleDownloadAgreement() {
    if (!detail?.signedAgreementPath || isDownloading) return
    setDownloading(true)
    setDownloadError(null)

    try {
      const url = await fetchSignedAgreementUrl(detail.signedAgreementPath, { download: true })
      window.open(url, '_blank', 'noopener')
    } catch (fetchError) {
      // eslint-disable-next-line no-console
      console.error('Failed to get signed agreement:', fetchError)
      setDownloadError('Could not download the loan agreement. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/adminHome/loans')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Loan details</h1>
          <div />
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading loan details…" className={styles.skeletonStack}>
            <div className={styles.itemCard}>
              <Skeleton width="6rem" height="4.5rem" radius="0.625rem" />
              <div className={styles.itemInfo}>
                <Skeleton width="45%" height="1.5625rem" shape="pill" />
                <Skeleton width="30%" height="1.0625rem" shape="pill" />
              </div>
              <Skeleton width="7.5rem" height="2rem" shape="pill" />
            </div>

            <div className={styles.card}>
              {LOAN_DETAIL_LABELS.map((label, index) => (
                <div key={label} className={styles.row}>
                  <span className={styles.rowLabel}>{label}</span>
                  <Skeleton
                    width={SKELETON_VALUE_WIDTHS[index % SKELETON_VALUE_WIDTHS.length]}
                    height="1.25rem"
                    shape="pill"
                  />
                </div>
              ))}
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && detail && state && (
          <>
            <div className={styles.itemCard}>
              {detail.imageUrl && <img src={detail.imageUrl} alt="" className={styles.itemThumb} />}
              <div className={styles.itemInfo}>
                <p className={styles.itemName}>{detail.itemName}</p>
                <p className={styles.itemMeta}>
                  {detail.serialNumber && <span>{detail.serialNumber}</span>}
                  <span>{ROLE_LABEL[detail.itemRole]}</span>
                </p>
              </div>
              <span className={`${styles.statusBadge} ${BADGE_CLASS[state]}`}>{BADGE_LABEL[state]}</span>
            </div>

            <div className={styles.actionRow}>
              {(state === 'requests' || state === 'returns') && (
                <button type="button" className={styles.agreementButton} onClick={() => setAvailabilityOpen(true)}>
                  <span className={styles.buttonIcon}>
                    <CalendarIcon size={22} />
                  </span>
                  {state === 'requests' ? 'View checkout availability' : 'View return availability'}
                </button>
              )}

              {detail.signedAgreementPath && (
                <button
                  type="button"
                  className={styles.agreementButton}
                  onClick={() => void handleDownloadAgreement()}
                  disabled={isDownloading}
                >
                  <span className={styles.buttonIcon}>
                    <DownloadIconFilled size={14} />
                  </span>
                  {isDownloading ? 'Preparing…' : 'Download hardware loan agreement'}
                </button>
              )}
            </div>

            {downloadError && <p className={styles.inlineError}>{downloadError}</p>}

            <div className={styles.card}>
              <button
                type="button"
                className={styles.memberRow}
                onClick={() => navigate(`/adminHome/members/${detail.memberId}`)}
              >
                <span className={styles.rowLabel}>Member</span>
                <span className={styles.rowValueLink}>{detail.memberName}</span>
              </button>

              {/* Hand-offs get arranged over Discord as often as by email, so
                  the handle belongs next to the address rather than one screen
                  away on the member's profile. */}
              {detail.memberDiscord && <DetailRow label="Discord" value={detail.memberDiscord} />}
              <DetailRow label="Requested" value={formatDate(detail.requestedAt)} />
              {detail.returnDate && <DetailRow label="Return date" value={formatCalendarDate(detail.returnDate)} />}
              {detail.reviewedAt && <DetailRow label="Checked out" value={formatDate(detail.reviewedAt)} />}
              {detail.reviewerName && <DetailRow label="Checked out by" value={detail.reviewerName} />}
              {/* "Returned on" rather than "Returned": the status badge above
                  already says "Returned", and two different meanings behind
                  one word is a needless re-read — more so read aloud. */}
              {detail.returnedAt && <DetailRow label="Returned on" value={formatDate(detail.returnedAt)} />}
              {detail.returnedByName && <DetailRow label="Received by" value={detail.returnedByName} />}
              {detail.reviewNote && <DetailRow label="Note" value={detail.reviewNote} />}
            </div>

            {detail.otherItems.length > 0 && (
              <div className={styles.card}>
                <span className={styles.cardLabel}>Also included in this request</span>
                <ul className={styles.otherItemsList}>
                  {detail.otherItems.map((item) => (
                    <li key={item.id}>
                      {/* Each sibling is a loan in its own right, with its own
                          serial, return date and hand-off — so this opens that
                          item's detail screen rather than being a bare list. */}
                      <button
                        type="button"
                        className={styles.otherItem}
                        onClick={() => navigate(`/adminHome/loans/${item.id}`)}
                        aria-label={`View loan details for ${item.itemName}`}
                      >
                        {/* A fixed-size slot either way: a product with no
                            photo would otherwise pull its name left and
                            break the column the other rows line up on. */}
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className={styles.otherItemThumb} />
                        ) : (
                          <span className={styles.otherItemThumbEmpty}>
                            <ImagePlaceholderIconFilled size={20} />
                          </span>
                        )}
                        <span className={styles.otherItemName}>{item.itemName}</span>
                        <span className={styles.otherItemRole}>{ROLE_LABEL[item.itemRole]}</span>
                        <ChevronRightIcon size={16} className={styles.otherItemChevron} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {isAvailabilityOpen && detail && (
        <AvailabilityModal
          loanRequestId={detail.loanRequestId}
          memberName={detail.memberName}
          requestedAt={detail.requestedAt}
          purpose={state === 'returns' ? 'return' : 'checkout'}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}
    </div>
  )
}
