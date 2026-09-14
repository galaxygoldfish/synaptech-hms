import { CheckCircleIcon } from './icons'

interface SuccessStepProps {
  serial: string
  onDone: () => void
}

export function SuccessStep({ serial, onDone }: SuccessStepProps) {
  return (
    <div className="return-flow__body">
      <h2 className="return-flow__status-title">Success</h2>
      <div className="return-flow__status-icon return-flow__status-icon--success">
        <CheckCircleIcon size={40} />
      </div>
      <p className="return-flow__status-message">
        Hardware item with serial {serial} marked as returned
      </p>
      <button type="button" className="return-flow__primary-button" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
