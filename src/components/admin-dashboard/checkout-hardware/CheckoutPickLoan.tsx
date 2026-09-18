import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlowPage } from '../hardware-flow/FlowPage'
import { LoanPickList, formatTimestampDate } from '../hardware-flow/LoanPickList'
import {
  bucketForLoanItem,
  fetchAllLoanRequestItems,
  type AdminLoanRequestItemSummary,
} from '../../../lib/loanRequests'

/**
 * Picking the loan by hand instead of by barcode — the other way past the
 * camera, for a unit whose label has come off and for a requested item that
 * never had a serial assigned to scan in the first place.
 */
export default function CheckoutPickLoan() {
  const navigate = useNavigate()

  const [loans, setLoans] = useState<AdminLoanRequestItemSummary[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // Only loans waiting to be handed over. bucketForLoanItem is the same
  // judgement the dashboard counts and the loans list use, so "waiting to be
  // handed over" can't come to mean something different here.
  const waiting = useMemo(
    () => loans.filter((loan) => bucketForLoanItem(loan) === 'requests'),
    [loans],
  )

  return (
    <FlowPage heading="Pick a loan request" onBack={() => navigate('/adminHome/checkout')}>
      <LoanPickList
        loans={waiting}
        isLoading={isLoading}
        error={error}
        loadingLabel="Loading the loans waiting to be handed over…"
        emptyMessage="No hardware is waiting to be handed over. Every checkout request has been completed."
        dateFor={(loan) => `Requested on ${formatTimestampDate(loan.requestedAt)}`}
        rowLabel={(loan) => `Hand over ${loan.itemName} to ${loan.memberName}`}
        onPick={(loan) =>
          navigate(`/adminHome/checkout/${loan.id}/agreement`, {
            state: { serialVerifiedBy: 'database' },
          })
        }
      />
    </FlowPage>
  )
}
