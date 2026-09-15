import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner'
import { ChevronRightIcon, DatabaseIcon } from './icons'

interface BarcodeScanStepProps {
  active: boolean
  onDetected: (serial: string) => void
  onUseSerialEntry: () => void
}

export function BarcodeScanStep({ active, onDetected, onUseSerialEntry }: BarcodeScanStepProps) {
  const { videoRef, isSupported, permissionError } = useBarcodeScanner(onDetected, active)

  return (
    <div className="return-flow__body">
      <div className="return-flow__scan-frame">
        {isSupported ? (
          <video ref={videoRef} className="return-flow__scan-video" muted playsInline />
        ) : (
          <p className="return-flow__scan-placeholder">placeholder for live camera view</p>
        )}
      </div>

      {permissionError && <p className="status-text status-text--error">{permissionError}</p>}

      <p className="return-flow__caption">Please scan the hardware item barcode</p>

      <button type="button" className="return-flow__alt-button" onClick={onUseSerialEntry}>
        <span className="return-flow__alt-button-label">
          <DatabaseIcon size={20} />
          Enter serial number
        </span>
        <ChevronRightIcon size={20} />
      </button>
    </div>
  )
}
