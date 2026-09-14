import { XCircleIcon } from './icons'

interface ErrorStepProps {
  message: string
  onRetry: () => void
}

export function ErrorStep({ message, onRetry }: ErrorStepProps) {
  return (
    <div className="checkout-flow__body">
      <h2 className="checkout-flow__status-title">Error</h2>
      <div className="checkout-flow__status-icon checkout-flow__status-icon--error">
        <XCircleIcon size={40} />
      </div>
      <p className="checkout-flow__status-message">{message}</p>
      <button type="button" className="checkout-flow__primary-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
