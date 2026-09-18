import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { FlowPage } from '../hardware-flow/FlowPage'
import { FlowSuccess } from '../hardware-flow/FlowSuccess'
import { LoanConfirmCard } from '../hardware-flow/LoanConfirmCard'
import {
  bucketForLoanItem,
  fetchLoanRequestItemDetail,
  markLoanRequestItemReturned,
  type AdminLoanRequestDetail,
} from '../../../lib/loanRequests'
import { Skeleton, SkeletonScreen } from '../../skeleton/Skeleton'
import styles from '../hardware-flow/HardwareFlow.module.css'

/**
 * Step 2 of "Return hardware": check the loan, then record that the hardware
 * came back.
 *
 * This is the write, and the only one in the flow. It plays the part the
 * agreement plays in checkout — the step every route into the flow converges
 * on, so scanning, typing a serial and picking off the list all end the same
 * way.
 *
 * Recording is what fires the member's return confirmation email and the
 * admin copy, via the trigger in the 20260922000000 migration.
 */

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

export default function ReturnConfirm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuth()

  const [detail, setDetail] = useState<AdminLoanRequestDetail | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isRecorded, setRecorded] = useState(false)

  // Step 1 is what decided this is the right loan — by scan, by typed serial,
  // or by picking it off the list of what's out. Reaching this by URL skips
  // that, so it sends you back rather than offering to close a loan nothing
  // led to.
  const verifiedBy = (location.state as { serialVerifiedBy?: unknown } | null)?.serialVerifiedBy
  const isVerified =
    verifiedBy === 'scan' || verifiedBy === 'manual' || verifiedBy === 'database'

  useEffect(() => {
    if (!isVerified) navigate('/adminHome/return', { replace: true })
  }, [isVerified, navigate])

  useEffect(() => {
    if (!id || !isVerified) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLoanRequestItemDetail(id)
      .then((loan) => {
        if (!cancelled) setDetail(loan)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the loan being returned:', fetchError)
        if (!cancelled) setError('Could not load this loan. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, isVerified])

  if (!isVerified || !id) return null

  async function handleRecordReturn() {
    if (!detail || !profile || isSubmitting) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      await markLoanRequestItemReturned(detail.id, profile.id)
      setRecorded(true)
    } catch (returnError) {
      // eslint-disable-next-line no-console
      console.error('Failed to record the return:', returnError)
      setSubmitError('Could not record the return. Please try again.')
      setSubmitting(false)
    }
  }

  if (isRecorded && detail) {
    return (
      <FlowSuccess
        heading="Hardware returned"
        detail={[
          `${detail.itemName}${
            detail.serialNumber ? ` (${detail.serialNumber})` : ''
          } is back in stock.`,
          `${detail.memberName} has been emailed a confirmation.`,
        ]}
        onDone={() => navigate('/adminHome')}
      />
    )
  }

  // A loan that already came back. Reached by scanning a unit whose return
  // was recorded a moment ago on another device, or by going back after
  // recording one — either way, saying so beats offering to close it twice.
  const alreadyReturned = detail?.returnedAt != null

  return (
    <FlowPage heading="Return hardware" onBack={() => navigate('/adminHome/return')}>
      {isLoading && (
        <SkeletonScreen label="Loading the loan…" className={styles.skeletonStack}>
          <div className={styles.confirmCard}>
            <Skeleton width="14rem" height="1.5rem" shape="pill" />
            <Skeleton width="9rem" height="1.125rem" shape="pill" />
            <Skeleton height="3.5rem" radius="999px" />
          </div>
        </SkeletonScreen>
      )}

      {!isLoading && error && <p className={styles.status}>{error}</p>}

      {!isLoading && !error && detail && alreadyReturned && (
        <p className={styles.status}>
          {detail.itemName} was already returned on {formatTimestampDate(detail.returnedAt!)}
          {detail.returnedByName ? `, recorded by ${detail.returnedByName}` : ''}.
        </p>
      )}

      {!isLoading && !error && detail && !alreadyReturned && (
        <LoanConfirmCard
          itemName={detail.itemName}
          serialNumber={detail.serialNumber}
          imageUrl={detail.imageUrl}
          rows={[
            { label: 'Returned by', value: detail.memberName },
            { label: 'Checked out on', value: formatTimestampDate(detail.requestedAt) },
            {
              label: 'Due back',
              value: detail.returnDate ? formatCalendarDate(detail.returnDate) : 'Not set',
              // Late hardware is the one thing here an admin might need to
              // act on, so the date says so itself.
              isAlert: bucketForLoanItem(detail) === 'overdue',
            },
          ]}
          actionLabel={isSubmitting ? 'recording…' : 'mark as returned'}
          actionDisabled={isSubmitting || !profile}
          errorMessage={submitError}
          onAction={() => void handleRecordReturn()}
        />
      )}
    </FlowPage>
  )
}
