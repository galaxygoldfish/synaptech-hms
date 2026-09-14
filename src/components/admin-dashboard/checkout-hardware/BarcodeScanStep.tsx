import { useBarcodeScanner } from '../../../hooks/useBarcodeScanner'
import { ChevronRightIcon, DatabaseIcon } from './icons'

interface BarcodeScanStepProps {
  active: boolean
  onDetected: (serial: string) => void
  onSelectFromDatabase: () => void
}

export function BarcodeScanStep({ active, onDetected, onSelectFromDatabase }: BarcodeScanStepProps) {
  const { videoRef, isSupported, permissionError } = useBarcodeScanner(onDetected, active)

  return (
    <div className="checkout-flow__body">
      <div className="checkout-flow__scan-frame">
        {isSupported ? (
          <video ref={videoRef} className="checkout-flow__scan-video" muted playsInline />
        ) : (
          <p className="checkout-flow__scan-placeholder">placeholder for live camera view</p>
        )}
      </div>

      {permissionError && <p className="status-text status-text--error">{permissionError}</p>}

      <p className="checkout-flow__caption">
        Please scan the hardware item barcode that you are checking out
      </p>

      {/* Per the Figma annotation on this button, this hands off to the
          "Manage hardware loans" screen (the 'view-loans' action). That
          screen already exists on a separate branch — /adminHome/loans
          is a dead click until it's merged into this one. */}
      <button type="button" className="checkout-flow__alt-button" onClick={onSelectFromDatabase}>
        <span className="checkout-flow__alt-button-label">
          <DatabaseIcon size={20} />
          Select loan from database
        </span>
        <ChevronRightIcon size={20} />
      </button>
    </div>
  )
}
