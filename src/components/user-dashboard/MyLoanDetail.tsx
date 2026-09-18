import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import ConfirmActionModal from '../ConfirmActionModal'
import { LoanStatusBadge } from './LoanStatusBadge'
import { EditAvailabilityModal } from './EditAvailabilityModal'
import {
  ArrowDownRightFilled,
  ArrowLeftIcon,
  ChevronRightFilled,
  CloseIcon,
  DocumentationIcon,
  DownloadIcon,
  HelpIconFilled,
  PencilIcon,
} from './icons'
import {
  cancelLoanRequest,
  fetchMemberLoanItem,
  isOutWithMember,
  memberLoanState,
  type MemberLoanItem,
} from '../../lib/memberLoans'
import { fetchSignedAgreementUrl } from '../../lib/loanRequests'
import { cancelReturnRequest, type AvailabilityTarget } from '../../lib/availability'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './MyLoanDetail.module.css'

// Help & support always points at the club's Discord — the same link the
// browse and checkout screens use.
const HELP_AND_SUPPORT_URL = 'https://discord.gg/zNKCN5233Y'

/** "June 23rd, 2026" — the long form the wireframes use under the name. */
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

export default function MyLoanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [item, setItem] = useState<MemberLoanItem | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isCancelOpen, setCancelOpen] = useState(false)
  const [isCancelling, setCancelling] = useState(false)
  /** Which set of hours the edit dialog is open on, if any. */
  const [editing, setEditing] = useState<AvailabilityTarget | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isDownloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchMemberLoanItem(id)
      .then((loan) => {
        if (!cancelled) setItem(loan)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the loan:', fetchError)
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

  const state = item ? memberLoanState(item) : null

  async function handleDownloadAgreement() {
    if (!item?.signedAgreementPath || isDownloading) return
    setDownloading(true)
    setActionError(null)

    try {
      // Whatever copy is on the record: the member's own signed PDF before
      // hand-off, and the countersigned one after — handOffLoanRequestItem
      // replaces the stored path with the stamped version, so this row always
      // serves the most complete copy that exists.
      const url = await fetchSignedAgreementUrl(item.signedAgreementPath, { download: true })
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (downloadError) {
      // eslint-disable-next-line no-console
      console.error('Failed to open the loan agreement:', downloadError)
      setActionError('Could not open your loan agreement. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function reload() {
    if (!id) return
    try {
      setItem(await fetchMemberLoanItem(id))
    } catch (reloadError) {
      // eslint-disable-next-line no-console
      console.error('Failed to reload the loan:', reloadError)
    }
  }

  /**
   * Withdraws whichever request is outstanding. A pending checkout is called
   * off entirely — the whole submission, add-ons included. A return request
   * is only the asking: the hardware stays out with the member, so the loan
   * goes back to being active rather than ending.
   */
  async function handleCancel() {
    if (!item || !state || isCancelling) return
    setCancelling(true)
    setActionError(null)

    try {
      if (state === 'return_requested') {
        await cancelReturnRequest(item.loanRequestId, item.id)
        await reload()
        setCancelOpen(false)
        setCancelling(false)
        return
      }
      await cancelLoanRequest(item.loanRequestId)
      navigate('/home/loans', { replace: true })
    } catch (cancelError) {
      // eslint-disable-next-line no-console
      console.error('Failed to cancel the request:', cancelError)
      setActionError('Could not cancel this request. Please try again.')
      setCancelling(false)
      setCancelOpen(false)
    }
  }

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  /** The dates under the badge, in the same words the list row uses. */
  const dateLines: string[] = (() => {
    if (!item || !state) return []
    if (state === 'checkout_requested' || state === 'cancelled' || state === 'denied') return []
    const checkedOut = `Checked out on ${formatLongDate(item.reviewedAt ?? item.requestedAt)}`
    if (state === 'returned' && item.returnedAt) {
      return [checkedOut, `Returned on ${formatLongDate(item.returnedAt)}`]
    }
    if (!item.returnDate) return [checkedOut, 'Return not required']
    return [checkedOut, `Return by ${formatLongDate(item.returnDate, true)}`]
  })()

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/home/loans')}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>

        {isLoading && (
          <SkeletonScreen label="Loading your loan…">
            <div className={styles.itemRow}>
              <Skeleton width="20rem" height="12rem" radius="0.75rem" />
              <div className={styles.itemInfo}>
                <Skeleton width="12rem" height="2.25rem" shape="pill" />
                <Skeleton width="20rem" height="1.25rem" shape="pill" />
                <Skeleton width="6rem" height="1.75rem" shape="pill" />
              </div>
            </div>
          </SkeletonScreen>
        )}

        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && item && state && (
          <>
            <div className={styles.itemRow}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className={styles.itemImage} />
              ) : (
                <span className={styles.itemImageEmpty} />
              )}

              <div className={styles.itemInfo}>
                <h1 className={styles.itemName}>{item.itemName}</h1>
                {item.itemDescription && (
                  <p className={styles.itemDescription}>{item.itemDescription}</p>
                )}
                <div>
                  <LoanStatusBadge state={state} item={item} />
                </div>
                {dateLines.map((line) => (
                  <p className={styles.itemDate} key={line}>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {actionError && <p className={styles.inlineError}>{actionError}</p>}

            <div className={styles.linkRows}>
              {/* The one action that changes the loan, when there is one, sits
                  first and tinted — everything below it only reads. */}
              {isOutWithMember(state) && state !== 'return_requested' && (
                <button
                  type="button"
                  className={`${styles.linkRow} ${styles.linkRowTop} ${styles.linkRowPrimary}`}
                  onClick={() => navigate(`/home/loans/${item.id}/return`)}
                >
                  <span className={styles.linkRowLeft}>
                    <span className={styles.linkRowIcon}>
                      <ArrowDownRightFilled size={15} />
                    </span>
                    Start return
                  </span>
                  <ChevronRightFilled size={9} color="#474747" />
                </button>
              )}

              {/* A return already asked for: the way out is to withdraw it,
                  and the hours can still be changed until someone collects. */}
              {state === 'return_requested' && (
                <>
                  <button
                    type="button"
                    className={`${styles.linkRow} ${styles.linkRowTop} ${styles.linkRowCancel}`}
                    onClick={() => setCancelOpen(true)}
                  >
                    <span className={styles.linkRowLeft}>
                      <span className={styles.linkRowIcon}>
                        <CloseIcon size={16} />
                      </span>
                      Cancel return request
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.linkRow}
                    onClick={() =>
                      setEditing({
                        kind: 'return',
                        loanRequestId: item.loanRequestId,
                        loanRequestItemId: item.id,
                      })
                    }
                  >
                    <span className={styles.linkRowLeft}>
                      <span className={styles.linkRowIcon}>
                        <PencilIcon size={18} />
                      </span>
                      Edit return availability
                    </span>
                  </button>
                </>
              )}

              {state === 'checkout_requested' && (
                <>
                  <button
                    type="button"
                    className={`${styles.linkRow} ${styles.linkRowTop} ${styles.linkRowCancel}`}
                    onClick={() => setCancelOpen(true)}
                  >
                    <span className={styles.linkRowLeft}>
                      <span className={styles.linkRowIcon}>
                        <CloseIcon size={16} />
                      </span>
                      Cancel request
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.linkRow}
                    onClick={() =>
                      setEditing({ kind: 'checkout', loanRequestId: item.loanRequestId })
                    }
                  >
                    <span className={styles.linkRowLeft}>
                      <span className={styles.linkRowIcon}>
                        <PencilIcon size={18} />
                      </span>
                      Edit checkout availability
                    </span>
                  </button>
                </>
              )}

              {/* Hidden rather than disabled when there is no file: a member
                  who never had an agreement to sign has nothing to download,
                  and a greyed row would just raise the question. */}
              {item.signedAgreementPath && (
                <button
                  type="button"
                  className={styles.linkRow}
                  onClick={() => void handleDownloadAgreement()}
                  disabled={isDownloading}
                >
                  <span className={styles.linkRowLeft}>
                    <span className={styles.linkRowIcon}>
                      <DownloadIcon size={20} />
                    </span>
                    {isDownloading ? 'Opening…' : 'Download signed Hardware Loan Agreement'}
                  </span>
                </button>
              )}

              <button
                type="button"
                className={styles.linkRow}
                onClick={() =>
                  item.documentationUrl &&
                  window.open(item.documentationUrl, '_blank', 'noopener,noreferrer')
                }
                disabled={!item.documentationUrl}
              >
                <span className={styles.linkRowLeft}>
                  <span className={styles.linkRowIcon}>
                    <DocumentationIcon size={22} />
                  </span>
                  View item-specific documentation
                </span>
                <ChevronRightFilled size={9} color="#474747" />
              </button>

              <a
                className={`${styles.linkRow} ${styles.linkRowBottom}`}
                href={HELP_AND_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className={styles.linkRowLeft}>
                  <span className={styles.linkRowIcon}>
                    <HelpIconFilled size={22} />
                  </span>
                  Get help &amp; support
                </span>
                <ChevronRightFilled size={9} color="#474747" />
              </a>
            </div>
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {/* Cancelling takes the whole submission with it — the add-ons were
          asked for together with this and there is no way to collect half a
          request. */}
      <ConfirmActionModal
        isOpen={isCancelOpen}
        heading={state === 'return_requested' ? 'Withdraw this return request?' : 'Cancel this request?'}
        body={
          state === 'return_requested'
            ? [
                `${item?.itemName ?? 'This item'} stays out with you, and your return date does not change.`,
                'You can ask to return it again at any time.',
              ]
            : [
                `This cancels your request for ${item?.itemName ?? 'this item'} and anything requested alongside it.`,
                'You can submit a new request at any time.',
              ]
        }
        confirmLabel={
          isCancelling
            ? 'Cancelling…'
            : state === 'return_requested'
              ? 'Withdraw request'
              : 'Cancel request'
        }
        confirmDisabled={isCancelling}
        onConfirm={() => void handleCancel()}
        onCancel={() => setCancelOpen(false)}
      />

      {editing && (
        <EditAvailabilityModal
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  )
}
