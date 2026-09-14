import '../styles.css'
import './admin-checkout-hardware.css'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHardwareCheckout } from '../hooks/useHardwareCheckout'
import { CheckoutFlowHeader } from '../components/admin-dashboard/checkout-hardware/CheckoutFlowHeader'
import { BarcodeScanStep } from '../components/admin-dashboard/checkout-hardware/BarcodeScanStep'
import { LoadingStep } from '../components/admin-dashboard/checkout-hardware/LoadingStep'
import { ErrorStep } from '../components/admin-dashboard/checkout-hardware/ErrorStep'
import { SuccessStep } from '../components/admin-dashboard/checkout-hardware/SuccessStep'


export default function AdminCheckoutHardwarePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const { step, resolvedSerial, errorMessage, submitSerial, cancel, retry } = useHardwareCheckout()

  const userName = profile?.first_name ?? ''

  return (
    <div className="app-shell checkout-flow">
      <CheckoutFlowHeader userName={userName} onBack={() => navigate('/adminHome')} />

      <h2 className="checkout-flow__title">Check out hardware</h2>

      {step === 'scan' && (
        <BarcodeScanStep
          active={step === 'scan'}
          onDetected={submitSerial}
          onSelectFromDatabase={() => navigate('/adminHome/loans')}
        />
      )}

      {step === 'loading' && <LoadingStep onCancel={cancel} />}

      {step === 'error' && <ErrorStep message={errorMessage} onRetry={retry} />}

      {step === 'success' && (
        <SuccessStep serial={resolvedSerial} onDone={() => navigate('/adminHome')} />
      )}
    </div>
  )
}
