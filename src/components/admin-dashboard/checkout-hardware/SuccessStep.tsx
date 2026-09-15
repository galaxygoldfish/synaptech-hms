import { CheckCircleIcon } from './icons'

interface SuccessStepProps {
  serial: string
  onDone: () => void
}

export function SuccessStep({ serial, onDone }: SuccessStepProps) {
  return (
    <div className="checkout-flow__body">
      <h2 className="checkout-flow__status-title">Success</h2>
      <div className="checkout-flow__status-icon checkout-flow__status-icon--success">
        <CheckCircleIcon size={40} />
      </div>
      <p className="checkout-flow__status-message">
        Hardware item with serial {serial} marked as checked out
      </p>
      <button type="button" className="checkout-flow__primary-button" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
