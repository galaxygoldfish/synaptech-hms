import type { KeyboardEvent } from 'react'
import { CameraIcon, ChevronRightIcon } from './icons'

interface SerialEntryStepProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onUseScanner: () => void
}

export function SerialEntryStep({ value, onChange, onSubmit, onUseScanner }: SerialEntryStepProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && value.trim()) onSubmit()
  }

  return (
    <div className="return-flow__body">
      <p className="return-flow__caption return-flow__caption--lead">
        Please enter the serial number of the item you are returning
      </p>

      <div className="return-flow__serial-input-group">
        <span className="return-flow__serial-prefix">SYN-</span>
        <input
          className="return-flow__serial-input"
          value={value}
          onChange={event => onChange(event.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="000000"
          autoFocus
          aria-label="Serial number"
        />
      </div>

      <button
        type="button"
        className="return-flow__primary-button"
        onClick={onSubmit}
        disabled={!value.trim()}
      >
        Next
      </button>

      <button type="button" className="return-flow__alt-button" onClick={onUseScanner}>
        <span className="return-flow__alt-button-label">
          <CameraIcon size={20} />
          Scan barcode instead
        </span>
        <ChevronRightIcon size={20} />
      </button>
    </div>
  )
}
