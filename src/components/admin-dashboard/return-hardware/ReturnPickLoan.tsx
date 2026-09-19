import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlowPage } from '../hardware-flow/FlowPage'
import { LoanPickList } from '../hardware-flow/LoanPickList'
import {
  bucketForLoanItem,
  fetchAllLoanRequestItems,
  type AdminLoanRequestItemSummary,
} from '../../../lib/loanRequests'

/**
 * Picking the loan by hand instead of by barcode, for hardware coming back
 * with a label that has come off or was never assigned a serial.
 *
 * Lists what is currently out — due, overdue, and already asked back alike,
 * because all three are hardware someone can walk up and hand over; a
 * pending return request doesn't put the item back until this flow records
 * it.
 */

function formatCalendarDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

export default function ReturnPickLoan() {
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

  // Everything currently in somebody's hands. bucketForLoanItem is the same
  // judgement the dashboard counts and the loans list use, so "still out"
  // can't come to mean something different here.
  const out = useMemo(
    () =>
      loans.filter((loan) => {
        const bucket = bucketForLoanItem(loan)
        return bucket === 'active' || bucket === 'overdue' || bucket === 'returns'
      }),
    [loans],
  )

  return (
    <FlowPage heading="Pick a loan to return" onBack={() => navigate('/adminHome/return')}>
      <LoanPickList
        loans={out}
        isLoading={isLoading}
        error={error}
        loadingLabel="Loading the hardware that is out on loan…"
        emptyMessage="No hardware is out on loan. Everything the club has lent out is back."
        // The due date, not the request date: for something being handed back
        // it's the number that says whether this is late.
        dateFor={(loan) =>
          loan.returnDate ? `Due back ${formatCalendarDate(loan.returnDate)}` : 'No return date set'
        }
        rowLabel={(loan) => `Take back ${loan.itemName} from ${loan.memberName}`}
        onPick={(loan) =>
          navigate(`/adminHome/return/${loan.id}/confirm`, {
            state: { serialVerifiedBy: 'database' },
          })
        }
      />
    </FlowPage>
  )
}
