import { XCircleIcon } from './icons'

interface ErrorStepProps {
  message: string
  onRetry: () => void
}

export function ErrorStep({ message, onRetry }: ErrorStepProps) {
  return (
    <div className="return-flow__body">
      <h2 className="return-flow__status-title">Error</h2>
      <div className="return-flow__status-icon return-flow__status-icon--error">
        <XCircleIcon size={40} />
      </div>
      <p className="return-flow__status-message">{message}</p>
      <button type="button" className="return-flow__primary-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
