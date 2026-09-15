import { CloseIcon } from './icons'

interface LoadingStepProps {
  onCancel: () => void
}

export function LoadingStep({ onCancel }: LoadingStepProps) {
  return (
    <div className="checkout-flow__body">
      <div className="checkout-flow__spinner" role="status" aria-label="Loading" />
      <button
        type="button"
        className="checkout-flow__cancel-button"
        onClick={onCancel}
        aria-label="Cancel"
      >
        <CloseIcon size={24} />
      </button>
    </div>
  )
}
