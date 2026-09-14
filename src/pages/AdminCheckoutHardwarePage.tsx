import '../styles.css'
import './admin-checkout-hardware.css'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHardwareCheckout } from '../hooks/useHardwareCheckout'
import { CheckoutFlowHeader } from '../components/admin-dashboard/checkout-hardware/CheckoutFlowHeader'
import { BarcodeScanStep } from '../components/admin-dashboard/checkout-hardware/BarcodeScanStep'
import { LoadingStep } from '../components/admin-dashboard/checkout-hardware/LoadingStep'
import { ErrorStep } from '../components/admin-dashboard/checkout-hardware/ErrorStep'
import { SuccessStep } from '../components/admin-dashboard/checkout-hardware/SuccessStep'
import { AttestAgreementStep } from '../components/admin-dashboard/checkout-hardware/AttestAgreementStep'


export default function AdminCheckoutHardwarePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const {
    step,
    resolvedSerial,
    errorMessage,
    pendingApproval,
    submitSerial,
    submitRequestItem,
    approveAgreement,
    cancelApproval,
    cancel,
    retry,
  } = useHardwareCheckout()

  const userName = profile?.first_name ?? ''
  const managerName = profile ? `${profile.first_name} ${profile.last_name}` : userName

  useEffect(() => {
    const requestItemId = (location.state as { requestItemId?: unknown } | null)?.requestItemId
    if (!profile || typeof requestItemId !== 'string') return
    void submitRequestItem(requestItemId, profile.id, managerName)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, managerName, navigate, profile, submitRequestItem])

  return (
    <div className="app-shell checkout-flow">
      <CheckoutFlowHeader userName={userName} onBack={() => navigate('/adminHome')} />

      <h2 className="checkout-flow__title">Check out hardware</h2>

      {step === 'scan' && (
        <BarcodeScanStep
          active={step === 'scan'}
          onDetected={(serial) => void submitSerial(serial, profile?.id ?? '', managerName)}
          onSelectFromDatabase={() => navigate('/adminHome/loans')}
        />
      )}

      {step === 'loading' && <LoadingStep onCancel={cancel} />}

      {step === 'attest' && pendingApproval && (
        <AttestAgreementStep
          agreementUrl={pendingApproval.agreementUrl}
          itemName={pendingApproval.itemName}
          managerName={pendingApproval.managerName}
          isFinalizing={false}
          onApprove={() => void approveAgreement()}
          onCancel={cancelApproval}
        />
      )}

      {step === 'finalizing' && pendingApproval && (
        <AttestAgreementStep
          agreementUrl={pendingApproval.agreementUrl}
          itemName={pendingApproval.itemName}
          managerName={pendingApproval.managerName}
          isFinalizing
          onApprove={() => undefined}
          onCancel={cancelApproval}
        />
      )}

      {step === 'error' && <ErrorStep message={errorMessage} onRetry={retry} />}

      {step === 'success' && (
        <SuccessStep serial={resolvedSerial} onDone={() => navigate('/adminHome')} />
      )}
    </div>
  )
}
