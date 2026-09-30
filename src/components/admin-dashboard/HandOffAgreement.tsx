import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { LoanAgreementSignOff } from './LoanAgreementSignOff'

/**
 * Step 2 of the hand-off reached from a loan: the agreement itself is
 * LoanAgreementSignOff, shared with the dashboard's "Check out hardware"
 * flow. What's left here is this route's own two facts — that step 1
 * verified the serial, and that a recorded hand-off returns to the loan it
 * was started from.
 */
export default function HandOffAgreement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // The serial has to have been verified on step 1, by scan or by
  // attestation. Reaching this by URL skips that check, so it sends you back
  // to do it rather than quietly accepting an unverified hand-off.
  const verifiedBy = (location.state as { serialVerifiedBy?: unknown } | null)?.serialVerifiedBy
  const isVerified = verifiedBy === 'scan' || verifiedBy === 'attestation'

  useEffect(() => {
    if (!isVerified && id) navigate(`/adminHome/loans/${id}/hand-off`, { replace: true })
  }, [isVerified, id, navigate])

  if (!isVerified || !id) return null

  return (
    <LoanAgreementSignOff
      itemId={id}
      heading="Loan agreement sign off"
      subtext="Check that the borrower signed the agreement and that all fields are correct, then sign section 10."
      onBack={() => navigate(`/adminHome/loans/${id}/hand-off`)}
      onRecorded={(detail) => navigate(`/adminHome/loans/${detail.id}`, { replace: true })}
    />
  )
}
