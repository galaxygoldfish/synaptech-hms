import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AvailabilityModal } from './AvailabilityModal'
import ConfirmActionModal from '../ConfirmActionModal'
import { ArrowLeftIcon, CalendarIcon, DownloadIconFilled } from './icons'
import {
  bucketForLoanItem,
  fetchLoanRequestItemDetail,
  fetchSignedAgreementUrl,
  handOffLoanRequestItem,
  markLoanRequestItemReturned,
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

// The two things an admin does from here, per the checkout and return
// processes: hand the hardware over, and take it back.
type PendingAction = 'hand-off' | 'return'

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

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isActing, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadDetail = useCallback(async (itemId: string) => {
    const data = await fetchLoanRequestItemDetail(itemId)
    setDetail(data)
    return data
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

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

  // What this loan is waiting for the admin to do, if anything. A returned
  // or denied loan is finished; an active or overdue one is waiting to come
  // back even if the member hasn't formally asked to return it yet, since
  // hand-backs here get arranged over Discord as often as through the app.
  const action: PendingAction | null =
    state === 'requests' ? 'hand-off' : state === 'active' || state === 'overdue' || state === 'returns' ? 'return' : null

  // Handing off stamps a certificate onto the member's signed agreement, so
  // there has to be one to stamp. Without it the loan can't be completed
  // here, and saying why beats a button that fails when pressed.
  const canHandOff = Boolean(detail?.signedAgreementPath)

  const serialText = detail?.serialNumber ?? 'no serial number assigned'

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  async function handleDownloadAgreement() {
    if (!detail?.signedAgreementPath || isDownloading) return
    setDownloading(true)
    setDownloadError(null)

    try {
      const url = await fetchSignedAgreementUrl(detail.signedAgreementPath)
      window.open(url, '_blank', 'noopener')
    } catch (fetchError) {
      // eslint-disable-next-line no-console
      console.error('Failed to get signed agreement:', fetchError)
      setDownloadError('Could not open the signed agreement. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleConfirmAction() {
    if (!detail || !profile || !pendingAction || isActing) return
    setActing(true)
    setActionError(null)

    try {
      if (pendingAction === 'hand-off') {
        await handOffLoanRequestItem({
          itemId: detail.id,
          adminId: profile.id,
          adminName: `${profile.first_name} ${profile.last_name}`,
        })
      } else {
        await markLoanRequestItemReturned(detail.id, profile.id)
      }
      // Re-read rather than patching state locally: the status shown here is
      // derived from several fields across two tables, and the emails and
      // audit entries fire from the database, so the record that comes back
      // is the one that actually exists.
      await loadDetail(detail.id)
      setPendingAction(null)
    } catch (actionFailure) {
      // eslint-disable-next-line no-console
      console.error('Failed to update loan:', actionFailure)
      setActionError(
        pendingAction === 'hand-off'
          ? 'Could not record the hand-off. Please try again.'
          : 'Could not record the return. Please try again.',
      )
      setPendingAction(null)
    } finally {
      setActing(false)
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
              {action === 'hand-off' && (
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={() => setPendingAction('hand-off')}
                  disabled={!canHandOff}
                >
                  Mark as handed off
                </button>
              )}
              {action === 'return' && (
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={() => setPendingAction('return')}
                >
                  Mark as returned
                </button>
              )}

              {(state === 'requests' || state === 'returns') && (
                <button type="button" className={styles.agreementButton} onClick={() => setAvailabilityOpen(true)}>
                  <CalendarIcon size={18} />
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
                  <DownloadIconFilled size={14} />
                  {isDownloading ? 'Opening…' : 'View signed agreement'}
                </button>
              )}
            </div>

            {action === 'hand-off' && !canHandOff && (
              <p className={styles.actionNote}>
                This item has no signed agreement on file, so it can't be handed off here. Ask the
                member to submit their checkout again with a signed agreement.
              </p>
            )}
            {downloadError && <p className={styles.inlineError}>{downloadError}</p>}
            {actionError && <p className={styles.inlineError}>{actionError}</p>}

            <div className={styles.card}>
              <button
                type="button"
                className={styles.memberRow}
                onClick={() => navigate(`/adminHome/members/${detail.memberId}`)}
              >
                <span className={styles.rowLabel}>Member</span>
                <span className={styles.rowValueLink}>{detail.memberName}</span>
              </button>

              <DetailRow label="Member email" value={detail.memberEmail} />
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
                    <li key={item.itemName} className={styles.otherItem}>
                      <span>{item.itemName}</span>
                      <span className={styles.otherItemRole}>{ROLE_LABEL[item.itemRole]}</span>
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

      {/* The serial is the whole point of the confirmation: several units of
          the same product look identical on a shelf, and handing over the
          wrong one puts the loan on the wrong record and the wrong person's
          name against the wrong hardware. */}
      <ConfirmActionModal
        isOpen={pendingAction === 'hand-off' && detail !== null}
        heading="Hand off this hardware?"
        body={[
          `${detail?.itemName ?? ''} — ${serialText}`,
          `Check that this is the exact unit you are handing to ${detail?.memberName ?? 'this member'}.`,
          'Confirming also attests that they signed the loan agreement correctly. A certificate of approval will be added to their signed copy.',
        ]}
        confirmLabel={isActing ? 'Recording…' : 'Mark as handed off'}
        confirmDisabled={isActing}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmActionModal
        isOpen={pendingAction === 'return' && detail !== null}
        heading="Check this hardware back in?"
        body={[
          `${detail?.itemName ?? ''} — ${serialText}`,
          `Check that this is the exact unit ${detail?.memberName ?? 'this member'} is handing back to you.`,
          'This closes the loan, frees the unit for checkout, and emails the member their return confirmation.',
        ]}
        confirmLabel={isActing ? 'Recording…' : 'Mark as returned'}
        confirmDisabled={isActing}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  )
}
