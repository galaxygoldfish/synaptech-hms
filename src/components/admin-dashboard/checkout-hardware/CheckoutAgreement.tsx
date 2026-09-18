import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { LoanAgreementSignOff } from '../LoanAgreementSignOff'

/**
 * Step 2 of "Check out hardware": the agreement, shared with the hand-off
 * started from a loan (LoanAgreementSignOff). What's this route's own is
 * that step 1 established which loan by barcode, and that a recorded
 * hand-off lands on that loan.
 */
export default function CheckoutAgreement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Step 1 is what decided this is the right loan — by scan, by typed
  // serial, or by picking it out of the waiting list. Reaching this by URL
  // skips that, so it sends you back to the scan rather than opening an
  // agreement nothing led to.
  const verifiedBy = (location.state as { serialVerifiedBy?: unknown } | null)?.serialVerifiedBy
  const isVerified =
    verifiedBy === 'scan' || verifiedBy === 'manual' || verifiedBy === 'database'

  useEffect(() => {
    if (!isVerified) navigate('/adminHome/checkout', { replace: true })
  }, [isVerified, navigate])

  if (!isVerified || !id) return null

  return (
    <LoanAgreementSignOff
      itemId={id}
      heading="Loan agreement sign off"
      subtext="Check that the borrower signed the agreement and that all fields are correct, then sign section 10."
      onBack={() => navigate(verifiedBy === 'database' ? '/adminHome/checkout/pick' : '/adminHome/checkout')}
      onRecorded={(detail) => navigate(`/adminHome/loans/${detail.id}`, { replace: true })}
    />
  )
}
