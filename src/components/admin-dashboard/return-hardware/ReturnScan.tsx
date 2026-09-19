import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlowPage } from '../hardware-flow/FlowPage'
import { ScanColumn, type ScanFeedback } from '../hardware-flow/ScanColumn'
import { SerialEntryModal } from '../hardware-flow/SerialEntryModal'
import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner'
import { fetchEquipmentUnitBySerial } from '../../../lib/inventory'
import {
  fetchAllLoanRequestItems,
  matchReturnSerial,
  type AdminLoanRequestItemSummary,
} from '../../../lib/loanRequests'
import { normalizeSerialNumber, SERIAL_PREFIX } from '../../../lib/serialNumber'
import { Skeleton, SkeletonScreen } from '../../skeleton/Skeleton'
import styles from '../hardware-flow/HardwareFlow.module.css'

/**
 * Step 1 of "Return hardware": work out which loan the hardware being handed
 * back belongs to. The mirror of CheckoutScan, and built the same way — every
 * loan loaded up front so a scan is answered locally and instantly, with
 * inventory asked only about a serial that matched no loan at all.
 *
 * What differs is what counts as an answer. Here the loan has to be out:
 * a request nobody collected can't come back, and a loan already recorded as
 * returned can't come back twice.
 *
 * Step 2 (ReturnConfirm) is where the return is recorded. Nothing here
 * writes.
 */

const SUCCESS_HOLD_MS = 900
const FAILURE_HOLD_MS = 2200

/** How the serial was established, carried through to the confirm step. */
export type SerialSource = 'scan' | 'manual'

export default function ReturnScan() {
  const navigate = useNavigate()

  const [loans, setLoans] = useState<AdminLoanRequestItemSummary[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  // Bumped after a barcode that didn't resolve, to restart the camera loop —
  // it stops at the first thing it sees.
  const [scanAttempt, setScanAttempt] = useState(0)
  /** Set once a barcode resolves, to stop the camera while we navigate. */
  const [isResolved, setResolved] = useState(false)

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
      setScanAttempt((attempt) => attempt + 1)
    }, FAILURE_HOLD_MS)
  }

  function goToConfirm(loan: AdminLoanRequestItemSummary, source: SerialSource) {
    navigate(`/adminHome/return/${loan.id}/confirm`, { state: { serialVerifiedBy: source } })
  }

  /**
   * Answers one serial number, however it arrived. The camera and the typed
   * field share this so that a barcode and the same characters typed by hand
   * can never mean two different things.
   */
  async function resolveSerial(rawValue: string, source: SerialSource) {
    // The camera loop can fire again while a result is still on screen;
    // ignore it rather than stacking overlays and timers.
    if (feedback || isResolved || isResolving) return

    const serial = normalizeSerialNumber(rawValue)
    if (!serial || serial === SERIAL_PREFIX) return

    const match = matchReturnSerial(loans, serial)

    if (match.outcome === 'ready' && match.loan) {
      const loan = match.loan
      setManualError(null)
      setResolved(true)
      if (source === 'manual') {
        setManualSerial('')
        setSerialModalOpen(false)
        goToConfirm(loan, source)
        return
      }
      setFeedback({ kind: 'success', message: `${loan.itemName} from ${loan.memberName}` })
      holdTimer.current = setTimeout(() => {
        setFeedback(null)
        goToConfirm(loan, source)
      }, SUCCESS_HOLD_MS)
      return
    }

    // Requested but never collected. Saying "not out on loan" here would send
    // an admin looking for a record that does exist, so it names the state.
    if (match.outcome === 'not_handed_over' && match.loan) {
      reject(
        'warning',
        `${match.loan.itemName} was never handed over to ${match.loan.memberName}`,
        source,
      )
      return
    }

    // Nothing in the loans matched. Whether that's "already back on the
    // shelf" or "not our hardware" needs inventory, which is why this is the
    // one path that goes to the network.
    setResolving(true)
    try {
      const known = await fetchEquipmentUnitBySerial(serial)
      if (known) {
        reject('warning', `${known.equipment.name} is not out on loan`, source)
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
    !isLoading && !error && !isResolved,
    scanAttempt,
  )

  return (
    <FlowPage heading="Return hardware" onBack={() => navigate('/adminHome')}>
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

      {!isLoading && !error && (
        <div className={styles.scanTopPad}>
          <ScanColumn
            videoRef={videoRef}
            isSupported={isSupported}
            permissionError={permissionError}
            feedback={feedback}
            caption="Please scan the hardware item barcode that is being returned"
            pickLabel="Pick loan from database"
            onEnterSerial={() => {
              setManualError(null)
              setSerialModalOpen(true)
            }}
            onPickFromDatabase={() => navigate('/adminHome/return/pick')}
          />
        </div>
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
