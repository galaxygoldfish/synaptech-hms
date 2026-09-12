import '../styles.css'
import './admin-return-hardware.css'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useHardwareReturn } from '../hooks/useHardwareReturn'
import { ReturnFlowHeader } from '../components/admin-dashboard/return-hardware/ReturnFlowHeader'
import { BarcodeScanStep } from '../components/admin-dashboard/return-hardware/BarcodeScanStep'
import { SerialEntryStep } from '../components/admin-dashboard/return-hardware/SerialEntryStep'
import { LoadingStep } from '../components/admin-dashboard/return-hardware/LoadingStep'
import { ErrorStep } from '../components/admin-dashboard/return-hardware/ErrorStep'
import { SuccessStep } from '../components/admin-dashboard/return-hardware/SuccessStep'

export default function AdminReturnHardwarePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const {
    step,
    serialInput,
    setSerialInput,
    resolvedSerial,
    errorMessage,
    goToScan,
    goToSerialEntry,
    submitSerial,
    retry,
  } = useHardwareReturn()

  const userName = profile?.first_name ?? ''

  return (
    <div className="app-shell return-flow">
      <ReturnFlowHeader userName={userName} onBack={() => navigate('/adminHome')} />

      <h2 className="return-flow__title">Start a hardware return</h2>

      {step === 'scan' && (
        <BarcodeScanStep
          active={step === 'scan'}
          onDetected={submitSerial}
          onUseSerialEntry={goToSerialEntry}
        />
      )}

      {step === 'serial' && (
        <SerialEntryStep
          value={serialInput}
          onChange={setSerialInput}
          onSubmit={() => submitSerial(serialInput)}
          onUseScanner={goToScan}
        />
      )}

      {step === 'loading' && <LoadingStep />}

      {step === 'error' && <ErrorStep message={errorMessage} onRetry={retry} />}

      {step === 'success' && (
        <SuccessStep serial={resolvedSerial} onDone={() => navigate('/adminHome')} />
      )}
    </div>
  )
}
