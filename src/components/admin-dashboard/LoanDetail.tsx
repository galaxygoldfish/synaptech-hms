import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AvailabilityModal } from './AvailabilityModal'
import { CancelLoanRequestModal } from './CancelLoanRequestModal'
import { SwitchUnitModal } from './SwitchUnitModal'
import { Tooltip } from '../Tooltip'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIconFilled,
  ImagePlaceholderIconFilled,
  SwapIcon,
} from './icons'
import {
  bucketForLoanItem,
  cancelLoanRequestAsAdmin,
  fetchLoanRequestItemDetail,
  fetchSignedAgreementUrl,
  LoanConflictError,
  switchLoanItemUnit,
  UnitUnavailableError,
  type AdminLoanRequestDetail,
  type LoanBucket,
} from '../../lib/loanRequests'
import type { LoanRequestItemRole, UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './LoanDetail.module.css'

// Every state a loan can be in from this screen's point of view. A denied
// or cancelled request has no bucket (it never became a loan, so it's kept
// out of the list and the stat cards), but it's still a real record someone
// can land on by URL — showing it plainly beats showing nothing.
type LoanState = LoanBucket | 'denied' | 'cancelled'

const BADGE_CLASS: Record<LoanState, string> = {
  active: styles.badgeActive,
  overdue: styles.badgeOverdue,
  requests: styles.badgeRequests,
  returns: styles.badgeReturns,
  returned: styles.badgeReturned,
  denied: styles.badgeDenied,
  cancelled: styles.badgeDenied,
}

const BADGE_LABEL: Record<LoanState, string> = {
  active: 'Active',
  overdue: 'Overdue',
  requests: 'Checkout requested',
  returns: 'Return requested',
  returned: 'Returned',
  denied: 'Denied',
  cancelled: 'Cancelled',
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

  const [isCancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isCancelling, setCancelling] = useState(false)

  const [isSwitchOpen, setSwitchOpen] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [isSwitching, setSwitching] = useState(false)

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
  // bucketForLoanItem returns null only for a denied or cancelled request.
  const state: LoanState | null = detail
    ? (bucket ?? (detail.status === 'cancelled' ? 'cancelled' : 'denied'))
    : null

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function openCancel() {
    setCancelReason('')
    setCancelError(null)
    setCancelOpen(true)
  }

  async function handleCancelRequest() {
    if (!detail || isCancelling || !cancelReason.trim()) return
    setCancelling(true)
    setCancelError(null)

    try {
      await cancelLoanRequestAsAdmin(detail.loanRequestId, cancelReason)
      setCancelOpen(false)
      // Re-read rather than patch: the database stamped who and when, and
      // this screen should show what it recorded, not what was sent.
      setDetail(await fetchLoanRequestItemDetail(detail.id))
    } catch (cancelFailure) {
      // eslint-disable-next-line no-console
      console.error('Failed to cancel loan request:', cancelFailure)
      setCancelError(
        cancelFailure instanceof LoanConflictError
          ? cancelFailure.message
          : 'Could not cancel this request. Please try again.',
      )
    } finally {
      setCancelling(false)
    }
  }

  function openSwitch() {
    setSwitchError(null)
    setSwitchOpen(true)
  }

  async function handleSwitchUnit(unitId: string) {
    if (!detail || isSwitching) return
    setSwitching(true)
    setSwitchError(null)

    try {
      await switchLoanItemUnit(detail.id, unitId)
      setSwitchOpen(false)
      // Re-read rather than patch, as with a cancellation: the serial and the
      // agreement path shown are then the ones the database ended up with.
      setDetail(await fetchLoanRequestItemDetail(detail.id))
    } catch (switchFailure) {
      // eslint-disable-next-line no-console
      console.error('Failed to switch unit:', switchFailure)
      setSwitchError(
        switchFailure instanceof LoanConflictError || switchFailure instanceof UnitUnavailableError
          ? switchFailure.message
          : 'Could not switch the unit. Please try again.',
      )
    } finally {
      setSwitching(false)
    }
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
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

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
                  {/* Only before hand-off, like cancelling: once the hardware
                      is with the member, the unit they have is the one on the
                      loan. The serial itself is the button, not just the icon
                      beside it — it's the thing being changed, and the bigger
                      target. Wrapped in a span so the "·" still follows it. */}
                  {detail.serialNumber && state === 'requests' && (
                    <span>
                      <Tooltip text="Switch to a different unit">
                        <button
                          type="button"
                          className={styles.switchUnitButton}
                          onClick={openSwitch}
                          aria-label={`Switch unit (${detail.serialNumber})`}
                        >
                          {detail.serialNumber}
                          <SwapIcon size={16} />
                        </button>
                      </Tooltip>
                    </span>
                  )}
                  {detail.serialNumber && state !== 'requests' && <span>{detail.serialNumber}</span>}
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

              {/* Only before hand-off: once the hardware is out, the way to
                  end a loan is to take it back, not to cancel it. */}
              {state === 'requests' && (
                <button type="button" className={styles.cancelButton} onClick={openCancel}>
                  <span className={styles.buttonIcon}>
                    <CloseIcon size={18} />
                  </span>
                  Cancel request
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

            {downloadError && <p className={styles.inlineError} role="alert">{downloadError}</p>}

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
              {detail.cancelledAt && <DetailRow label="Cancelled on" value={formatDate(detail.cancelledAt)} />}
              {detail.cancelledByName && <DetailRow label="Cancelled by" value={detail.cancelledByName} />}
            </div>

            {/* Its own card: a reason is a sentence or two, and squeezed into
                a label/value row it would be cut off at the ellipsis. */}
            {detail.cancellationReason && (
              <div className={styles.card}>
                <span className={styles.cardLabel}>Reason for cancelling</span>
                <p className={styles.reasonText}>{detail.cancellationReason}</p>
              </div>
            )}

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

      {detail && (
        <CancelLoanRequestModal
          isOpen={isCancelOpen}
          memberName={detail.memberName}
          reason={cancelReason}
          error={cancelError}
          isSubmitting={isCancelling}
          onChange={setCancelReason}
          onConfirm={() => void handleCancelRequest()}
          onCancel={() => setCancelOpen(false)}
        />
      )}

      {isSwitchOpen && detail && (
        <SwitchUnitModal
          equipmentId={detail.equipmentId}
          itemName={detail.itemName}
          memberName={detail.memberName}
          currentUnitId={detail.equipmentUnitId}
          error={switchError}
          isSubmitting={isSwitching}
          onConfirm={(unitId) => void handleSwitchUnit(unitId)}
          onCancel={() => setSwitchOpen(false)}
        />
      )}

      {isAvailabilityOpen && detail && (
        <AvailabilityModal
          loanRequestId={detail.loanRequestId}
          memberName={detail.memberName}
          requestedAt={detail.requestedAt}
          loanRequestItemId={detail.id}
          purpose={state === 'returns' ? 'return' : 'checkout'}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}
    </div>
  )
}
