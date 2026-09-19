import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlowPage } from '../hardware-flow/FlowPage'
import { ScanColumn, type ScanFeedback } from '../hardware-flow/ScanColumn'
import { SerialEntryModal } from '../hardware-flow/SerialEntryModal'
import { LoanConfirmCard } from '../hardware-flow/LoanConfirmCard'
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner'
import { fetchEquipmentUnitBySerial } from '../../../lib/inventory'
import {
  fetchAllLoanRequestItems,
  matchCheckoutSerial,
  type AdminLoanRequestItemSummary,
} from '../../../lib/loanRequests'
import { normalizeSerialNumber, SERIAL_PREFIX } from '../../../lib/serialNumber'
import { Skeleton, SkeletonScreen } from '../../skeleton/Skeleton'
import styles from '../hardware-flow/HardwareFlow.module.css'

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

  /**
   * Says no, in whichever place the admin is looking: over the viewfinder for
   * a scan (and then back to live), inside the dialog for a typed serial,
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

  const { videoRef, isSupported, permissionError } = useBarcodeScanner(
    (value) => void resolveSerial(value, 'scan'),
    !isLoading && !error && confirmed === null,
    scanAttempt,
  )

  function handleBack() {
    if (!confirmed) {
      navigate('/adminHome')
      return
    }
    setConfirmed(null)
    // The camera stopped on the barcode that got us here.
    setScanAttempt((attempt) => attempt + 1)
  }

  return (
    <FlowPage heading="Check out hardware" onBack={handleBack}>
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
        <div className={styles.checkoutScanTopPad}>
          <ScanColumn
            videoRef={videoRef}
            isSupported={isSupported}
            permissionError={permissionError}
            feedback={feedback}
            caption="Please scan the hardware item barcode that you are checking out"
            pickLabel="Pick loan from database"
            onEnterSerial={() => {
              setManualError(null)
              setSerialModalOpen(true)
            }}
            onPickFromDatabase={() => navigate('/adminHome/checkout/pick')}
          />
        </div>
      )}

      {!isLoading && !error && confirmed && (
        <LoanConfirmCard
          itemName={confirmed.itemName}
          serialNumber={confirmed.serialNumber}
          imageUrl={confirmed.imageUrl}
          rows={[
            { label: 'Handing to', value: confirmed.memberName },
            { label: 'Requested on', value: formatTimestampDate(confirmed.requestedAt) },
            {
              label: 'Due back',
              value: confirmed.returnDate ? formatCalendarDate(confirmed.returnDate) : 'Not set',
            },
          ]}
          actionLabel="continue"
          onAction={() =>
            navigate(`/adminHome/checkout/${confirmed.id}/agreement`, {
              state: { serialVerifiedBy: confirmedVia },
            })
          }
        />
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
        onSubmit={() => {
          if (!manualSerial.trim()) return
          void resolveSerial(manualSerial, 'manual')
        }}
        onCancel={() => {
          setSerialModalOpen(false)
          setManualSerial('')
          setManualError(null)
        }}
      />
    </FlowPage>
  )
}
