import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { Header } from '../Header'
import { ProfileModal } from '../ProfileModal'
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ImagePlaceholderIconFilled,
  ScanIconFilled,
  ServerIconFilled,
} from '../icons'
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner'
import { fetchEquipmentUnitBySerial } from '../../../lib/inventory'
import {
  fetchAllLoanRequestItems,
  matchCheckoutSerial,
  type AdminLoanRequestItemSummary,
} from '../../../lib/loanRequests'
import { normalizeSerialNumber, SERIAL_PREFIX } from '../../../lib/serialNumber'
import { SerialEntryModal } from './SerialEntryModal'
import type { UserProfile } from '../../../types'
import { Skeleton, SkeletonScreen } from '../../skeleton/Skeleton'
import styles from './CheckoutHardware.module.css'

/**
 * Step 1 of "Check out hardware", reached from the admin dashboard: work out
 * which loan the hardware in your hands belongs to.
 *
 * Unlike the hand-off scan — which starts from a loan and only has to check
 * that the serial matches it — this starts from the barcode and has to find
 * the loan. So every loan item is loaded up front and the lookup happens
 * locally: a scan is answered instantly, and scanning a shelf of the wrong
 * things costs nothing. Inventory is only asked about a serial that matched
 * no loan at all, to tell "nobody requested this" apart from "this isn't our
 * hardware".
 *
 * Step 2 is the agreement (LoanAgreementSignOff), which is where anything is
 * actually recorded. Nothing on this screen writes.
 */

// Long enough to register as a result rather than a flicker, short enough
// not to hold up someone standing there with the hardware in their hands.
// Matches the hand-off scan's holds, since it's the same decision.
const SUCCESS_HOLD_MS = 900
const FAILURE_HOLD_MS = 2200

/** What the viewfinder shows over the camera after reading a barcode. */
type ScanFeedback = {
  kind: 'success' | 'warning' | 'failure'
  message: string
}

const MARKER_CLASS: Record<ScanFeedback['kind'], string> = {
  success: styles.scanMarkerSuccess,
  warning: styles.scanMarkerWarning,
  failure: styles.scanMarkerFailure,
}

function MarkerGlyph({ kind }: { kind: ScanFeedback['kind'] }) {
  if (kind === 'success') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M13 25.5 20.5 33 35 16" />
      </svg>
    )
  }
  if (kind === 'warning') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M24 13v18" />
        <path d="M24 37.5v.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
      <path d="M16 16l16 16" />
      <path d="M32 16l-16 16" />
    </svg>
  )
}

function formatTimestampDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatCalendarDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** How the serial was established, carried through to the agreement step. */
export type SerialSource = 'scan' | 'manual'

export default function CheckoutScan() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [loans, setLoans] = useState<AdminLoanRequestItemSummary[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  // Bumped after a barcode that didn't resolve, to restart the camera loop —
  // it stops at the first thing it sees.
  const [scanAttempt, setScanAttempt] = useState(0)
  /** The loan a barcode resolved to, waiting for the admin to confirm it. */
  const [confirmed, setConfirmed] = useState<AdminLoanRequestItemSummary | null>(null)
  const [confirmedVia, setConfirmedVia] = useState<SerialSource>('scan')

  const [isSerialModalOpen, setSerialModalOpen] = useState(false)
  const [manualSerial, setManualSerial] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [isResolving, setResolving] = useState(false)

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current)
    },
    [],
  )

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

  /**
   * Answers one serial number, however it arrived. The camera and the typed
   * field share this so that a barcode and the same characters typed by hand
   * can never mean two different things.
   */
  async function resolveSerial(rawValue: string, source: SerialSource) {
    // The camera loop can fire again while a result is still on screen;
    // ignore it rather than stacking overlays and timers.
    if (feedback || confirmed || isResolving) return

    const serial = normalizeSerialNumber(rawValue)
    if (!serial || serial === SERIAL_PREFIX) return

    const match = matchCheckoutSerial(loans, serial)

    if (match.outcome === 'ready' && match.loan) {
      const loan = match.loan
      setManualError(null)
      if (source === 'manual') {
        setManualSerial('')
        setSerialModalOpen(false)
        setConfirmedVia('manual')
        setConfirmed(loan)
        return
      }
      setFeedback({ kind: 'success', message: `${loan.itemName} for ${loan.memberName}` })
      holdTimer.current = setTimeout(() => {
        setFeedback(null)
        setConfirmedVia('scan')
        setConfirmed(loan)
      }, SUCCESS_HOLD_MS)
      return
    }

    if (match.outcome === 'already_out' && match.loan) {
      reject(
        'warning',
        `${match.loan.itemName} is already checked out to ${match.loan.memberName}`,
        source,
      )
      return
    }

    // Nothing in the loans matched. Whether that's "in stock, nobody asked
    // for it" or "not our hardware" needs inventory, which is why this is the
    // one path that goes to the network.
    setResolving(true)
    try {
      const known = await fetchEquipmentUnitBySerial(serial)
      if (known) {
        reject('warning', `${known.equipment.name} has no open checkout request`, source)
      } else {
        reject('failure', `${serial} is not recognised in inventory`, source)
      }
    } catch (lookupError) {
      // eslint-disable-next-line no-console
      console.error('Failed to look up the scanned serial:', lookupError)
      reject('failure', `Could not look up ${serial}. Please try again.`, source)
    } finally {
      setResolving(false)
    }
  }

  /**
   * Says no, in whichever place the admin is looking: over the viewfinder for
   * a scan (and then back to live), beneath the field for a typed serial,
   * where there is no camera to put it over.
   */
  function reject(kind: 'warning' | 'failure', message: string, source: SerialSource) {
    if (source === 'manual') {
      setManualError(message)
      return
    }
    setFeedback({ kind, message })
    holdTimer.current = setTimeout(() => {
      setFeedback(null)
      // Restart the camera loop, which stopped when it read this barcode.
      setScanAttempt((attempt) => attempt + 1)
    }, FAILURE_HOLD_MS)
  }

  const { videoRef, isSupported, permissionError } = useBarcodeScanner(
    (value) => void resolveSerial(value, 'scan'),
    !isLoading && !error && confirmed === null,
    scanAttempt,
  )

  function handleManualSubmit() {
    if (!manualSerial.trim()) return
    void resolveSerial(manualSerial, 'manual')
  }

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
            onClick={() => {
              if (!confirmed) {
                navigate('/adminHome')
                return
              }
              setConfirmed(null)
              // The camera stopped on the barcode that got us here.
              setScanAttempt((attempt) => attempt + 1)
            }}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Check out hardware</h1>
          <div />
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading hardware loans…" className={styles.skeletonStack}>
            <div className={styles.scanColumn}>
              <Skeleton height="20rem" radius="1.25rem" />
              <Skeleton width="70%" height="1rem" shape="pill" style={{ margin: '0 auto' }} />
              <Skeleton height="3.5rem" radius="0.9375rem" />
            </div>
          </SkeletonScreen>
        )}

        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && confirmed === null && (
          <>
            <p className={styles.subtext}>
              Scan the barcode on the item you are handing over. If it has been requested, the loan it
              belongs to is found for you.
            </p>

            <div className={styles.scanColumn}>
              <div className={styles.scanFrame}>
                {isSupported ? (
                  <video
                    ref={videoRef}
                    className={
                      feedback ? `${styles.scanVideo} ${styles.scanVideoBlurred}` : styles.scanVideo
                    }
                    muted
                    playsInline
                  />
                ) : (
                  // Only reached if the WebAssembly scanner can't load at all
                  // — typing the serial is the whole path then.
                  <p className={styles.scanPlaceholder}>
                    Barcode scanning isn&rsquo;t available here. Enter the serial number by hand
                    below instead.
                  </p>
                )}
                {feedback && (
                  <div className={styles.scanOverlay} role="status" aria-live="assertive">
                    <span className={`${styles.scanMarker} ${MARKER_CLASS[feedback.kind]}`}>
                      <MarkerGlyph kind={feedback.kind} />
                    </span>
                    <span className={styles.scanFeedbackText}>{feedback.message}</span>
                  </div>
                )}
              </div>

              {permissionError && <p className={styles.inlineError}>{permissionError}</p>}

              <p className={styles.scanCaption}>
                Please scan the hardware item barcode that you are checking out
              </p>

              {/* The two ways past the camera, as two of the same thing: one
                  for a label that won't read, one for hardware that can't be
                  identified from the label at all. Grouped, so they read as a
                  pair rather than as two more items in the column. */}
              <div className={styles.altActions}>
                <button
                  type="button"
                  className={styles.altButton}
                  onClick={() => {
                    setManualError(null)
                    setSerialModalOpen(true)
                  }}
                >
                  <span className={styles.altButtonLabel}>
                    <ScanIconFilled size={20} />
                    Enter the serial number manually
                  </span>
                  <ChevronRightIcon size={20} />
                </button>

                {/* For a requested item that never had a serial assigned, and
                    for a unit whose label is gone entirely — neither can be
                    scanned or typed, so the only way to them is the list. */}
                <button
                  type="button"
                  className={styles.altButton}
                  onClick={() => navigate('/adminHome/checkout/pick')}
                >
                  <span className={styles.altButtonLabel}>
                    <ServerIconFilled size={20} />
                    Pick the loan from the database
                  </span>
                  <ChevronRightIcon size={20} />
                </button>
              </div>
            </div>
          </>
        )}

        {!isLoading && !error && confirmed && (
          <div className={styles.confirmCard}>
            <div className={styles.confirmHead}>
              {confirmed.imageUrl ? (
                <img src={confirmed.imageUrl} alt="" className={styles.confirmThumb} />
              ) : (
                <span className={styles.confirmThumbEmpty}>
                  <ImagePlaceholderIconFilled size={28} />
                </span>
              )}
              <div className={styles.confirmHeadText}>
                <p className={styles.confirmName}>{confirmed.itemName}</p>
                <p className={styles.confirmSerial}>{confirmed.serialNumber}</p>
              </div>
            </div>

            <dl className={styles.confirmRows}>
              <div className={styles.confirmRow}>
                <dt className={styles.confirmLabel}>Handing to</dt>
                <dd className={styles.confirmValue}>{confirmed.memberName}</dd>
              </div>
              <div className={styles.confirmRow}>
                <dt className={styles.confirmLabel}>Requested on</dt>
                <dd className={styles.confirmValue}>{formatTimestampDate(confirmed.requestedAt)}</dd>
              </div>
              <div className={styles.confirmRow}>
                <dt className={styles.confirmLabel}>Due back</dt>
                <dd className={styles.confirmValue}>
                  {confirmed.returnDate ? formatCalendarDate(confirmed.returnDate) : 'Not set'}
                </dd>
              </div>
            </dl>

            {/* One action out of here. The wrong loan is backed out of with
              the Back button in the top row, which is where every other
              screen puts "not this". */}
            <div className={styles.confirmActions}>
            <button
              type="button"
              className={styles.confirmContinue}
              onClick={() =>
                navigate(`/adminHome/checkout/${confirmed.id}/agreement`, {
                  state: { serialVerifiedBy: confirmedVia },
                })
              }
            >
              continue
            </button>
            </div>
          </div>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      <SerialEntryModal
        isOpen={isSerialModalOpen}
        value={manualSerial}
        error={manualError}
        isSubmitting={isResolving}
        onChange={(value) => {
          setManualSerial(value)
          setManualError(null)
        }}
        onSubmit={handleManualSubmit}
        onCancel={() => {
          setSerialModalOpen(false)
          setManualSerial('')
          setManualError(null)
        }}
      />
    </div>
  )
}
