import { useEffect, useRef, type KeyboardEvent } from 'react'
import { SERIAL_PREFIX, SERIAL_SUFFIX_LENGTH } from '../../../lib/serialNumber'
import modalStyles from '../../Modal.module.css'
import styles from './HardwareFlow.module.css'

/** Masked, and the length of a real suffix — never an actual serial from the
    inventory, which reads as a value to keep rather than an example. */
const SERIAL_PLACEHOLDER = 'X'.repeat(SERIAL_SUFFIX_LENGTH)

interface SerialEntryModalProps {
  isOpen: boolean
  value: string
  /** Set when the last serial resolved to nothing usable; stays until retyped. */
  error: string | null
  isSubmitting: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/**
 * Typing a serial number instead of scanning it, for a label that won't read
 * or a camera that isn't there.
 *
 * Its own dialog rather than a field under the viewfinder: there are two
 * ways past the camera, and putting one of them permanently on the screen
 * as a form made them look like different kinds of thing. Built on
 * Modal.module.css like the app's other dialogs — the field is the only part
 * ConfirmActionModal couldn't have rendered, which is why this isn't one.
 *
 * Shared by the checkout and return flows: a serial typed at the desk means
 * the same thing whichever direction the hardware is going.
 */
export function SerialEntryModal({
  isOpen,
  value,
  error,
  isSubmitting,
  onChange,
  onSubmit,
  onCancel,
}: SerialEntryModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Opening this dialog is the decision to type; the cursor should already
  // be where the typing goes.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  if (!isOpen) return null

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className={`${modalStyles.overlay} ${modalStyles.overlayWelcome}`} onClick={onCancel}>
      <div
        className={modalStyles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Enter a serial number"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={modalStyles.headerRow}>
          <h2 className={modalStyles.heading}>Enter a serial number</h2>
        </div>

        <div className={modalStyles.bodyGroup}>
          <p className={modalStyles.body}>
            Type the serial number printed under the barcode on the unit you are handing over.
          </p>
        </div>

        <div className={styles.dialogBody}>
          <div className={styles.dialogField}>
            <span className={styles.dialogPrefix} aria-hidden="true">
              {SERIAL_PREFIX.replace('-', ' -')}
            </span>
            <input
              ref={inputRef}
              className={styles.dialogInput}
              value={value}
              placeholder={SERIAL_PLACEHOLDER}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Serial number"
              aria-invalid={error !== null}
            />
          </div>
          {error && (
            <p className={styles.dialogError} role="alert">
              {error}
            </p>
          )}
        </div>

        <div className={modalStyles.buttonRow}>
          <button type="button" className={modalStyles.buttonSecondary} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={modalStyles.button}
            onClick={onSubmit}
            disabled={!value.trim() || isSubmitting}
          >
            {isSubmitting ? 'Finding…' : 'Find loan'}
          </button>
        </div>
      </div>
    </div>
  )
}
