import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import ConfirmActionModal from '../ConfirmActionModal'
import { ArrowLeftIcon, ChevronRightIcon, ImagePlaceholderIconFilled, ScanIconFilled } from './icons'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { fetchEquipmentUnitBySerial } from '../../lib/inventory'
import { fetchLoanRequestItemDetail, type AdminLoanRequestDetail } from '../../lib/loanRequests'
import { normalizeSerialNumber } from '../../lib/serialNumber'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './HandOffAgreement.module.css'

// Long enough to register as a result rather than a flicker, short enough
// not to hold up someone standing there with the hardware in their hands.
const SUCCESS_HOLD_MS = 900
const FAILURE_HOLD_MS = 2200

/** What the viewfinder shows over the camera after reading a barcode. */
type ScanFeedback = { kind: 'success' } | { kind: 'failure'; reason: string }

function ScanMarker({ feedback }: { feedback: ScanFeedback }) {
  const isSuccess = feedback.kind === 'success'
  return (
    <div className={styles.scanOverlay} role="status" aria-live="assertive">
      <span
        className={
          isSuccess
            ? `${styles.scanMarker} ${styles.scanMarkerSuccess}`
            : `${styles.scanMarker} ${styles.scanMarkerFailure}`
        }
      >
        <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
          {isSuccess ? (
            <path d="M13 25.5 20.5 33 35 16" />
          ) : (
            <>
              <path d="M16 16l16 16" />
              <path d="M32 16l-16 16" />
            </>
          )}
        </svg>
      </span>
      <span className={styles.scanFeedbackText}>
        {isSuccess ? 'Serial number verified' : feedback.reason}
      </span>
    </div>
  )
}

export default function HandOffScan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [detail, setDetail] = useState<AdminLoanRequestDetail | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  // Bumped after a wrong barcode to restart the camera loop, which otherwise
  // stops at the first thing it sees.
  const [scanAttempt, setScanAttempt] = useState(0)
  const [isAttestOpen, setAttestOpen] = useState(false)

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLoanRequestItemDetail(id)
      .then((loan) => {
        if (!cancelled) setDetail(loan)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the hand-off:', fetchError)
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

  function goToAgreement(verifiedBy: 'scan' | 'attestation') {
    navigate(`/adminHome/loans/${id}/hand-off/agreement`, { state: { serialVerifiedBy: verifiedBy } })
  }

  function showFailure(reason: string) {
    setFeedback({ kind: 'failure', reason })
    holdTimer.current = setTimeout(() => {
      setFeedback(null)
      // Restart the camera loop, which stopped when it read this barcode.
      setScanAttempt((attempt) => attempt + 1)
    }, FAILURE_HOLD_MS)
  }

  async function handleDetected(rawValue: string) {
    // The loop can fire again while a result is still on screen; ignore it
    // rather than stacking overlays and timers.
    if (!detail || feedback) return
    const scanned = normalizeSerialNumber(rawValue)

    // An item with no unit assigned has nothing to check against, so any
    // barcode would be as good as none — those go through attestation.
    if (!detail.serialNumber) {
      showFailure('This loan has no serial number to check against')
      return
    }

    if (scanned === normalizeSerialNumber(detail.serialNumber)) {
      setFeedback({ kind: 'success' })
      holdTimer.current = setTimeout(() => goToAgreement('scan'), SUCCESS_HOLD_MS)
      return
    }

    // A wrong barcode is worth telling apart: a label from another unit is a
    // different mistake from something that isn't club hardware at all.
    try {
      const known = await fetchEquipmentUnitBySerial(scanned)
      showFailure(known ? 'Wrong serial number' : 'Not recognised in inventory')
    } catch {
      showFailure('Wrong serial number')
    }
  }

  const { videoRef, isSupported, permissionError } = useBarcodeScanner(
    (value) => void handleDetected(value),
    !isLoading && !error && detail !== null,
    scanAttempt,
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
            onClick={() => navigate(`/adminHome/loans/${id}`)}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Hand off hardware</h1>
          <div />
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading the hand-off…" className={styles.skeletonStack}>
            <div className={styles.summaryCard}>
              <Skeleton width="4.5rem" height="3.25rem" radius="0.625rem" />
              <div className={styles.summaryText}>
                <Skeleton width="9rem" height="1.375rem" shape="pill" />
                <Skeleton width="14rem" height="1rem" shape="pill" />
              </div>
            </div>
            <div className={styles.scanColumn}>
              <Skeleton height="20rem" radius="1.25rem" />
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && detail && (
          <>
            <div className={styles.summaryCard}>
              {detail.imageUrl ? (
                <img src={detail.imageUrl} alt="" className={styles.summaryThumb} />
              ) : (
                <span className={styles.summaryThumbEmpty}>
                  <ImagePlaceholderIconFilled size={24} />
                </span>
              )}
              <div className={styles.summaryText}>
                <p className={styles.summaryName}>{detail.itemName}</p>
                <p className={styles.summaryMeta}>
                  {detail.serialNumber ?? 'No serial assigned'} · handing to {detail.memberName}
                </p>
              </div>
            </div>

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
                  // — attestation is the whole path then.
                  <p className={styles.scanPlaceholder}>
                    Barcode scanning isn&rsquo;t available here. Attest to the serial number below
                    instead.
                  </p>
                )}
                {feedback && <ScanMarker feedback={feedback} />}
              </div>

              {permissionError && <p className={styles.inlineError}>{permissionError}</p>}

              <p className={styles.scanCaption}>
                Please scan the barcode of the item being handed off to verify serial number
              </p>

              <button type="button" className={styles.attestButton} onClick={() => setAttestOpen(true)}>
                <span className={styles.attestButtonLabel}>
                  <ScanIconFilled size={20} />
                  Manually attest to serial number
                </span>
                <ChevronRightIcon size={20} />
              </button>
            </div>
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {/* Skipping the scan is the one place nothing checks the admin's word,
          so the dialog names the serial and asks them to own it. */}
      <ConfirmActionModal
        isOpen={isAttestOpen && detail !== null}
        heading="Attest to the serial number?"
        body={[
          `${detail?.itemName ?? ''} — ${detail?.serialNumber ?? 'no serial number assigned'}`,
          'Are you absolutely sure this is the serial number printed on the unit you are handing over?',
        ]}
        confirmLabel="Yes, it matches"
        onConfirm={() => {
          setAttestOpen(false)
          goToAgreement('attestation')
        }}
        onCancel={() => setAttestOpen(false)}
      />
    </div>
  )
}
