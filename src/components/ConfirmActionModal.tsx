import styles from './Modal.module.css'

interface ConfirmActionModalProps {
  isOpen: boolean
  heading: string
  body: string[]
  confirmLabel: string
  confirmDisabled?: boolean
  hideCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Generic Cancel/Confirm dialog sharing Modal.module.css with
// ConfirmationModal (the sign-in "Welcome" dialog) and AccountErrorModal —
// same look, but with a two-button row instead of a single acknowledgment.
export default function ConfirmActionModal({
  isOpen,
  heading,
  body,
  confirmLabel,
  confirmDisabled,
  hideCancel,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  if (!isOpen) return null

  return (
    <div className={`${styles.overlay} ${styles.overlayWelcome}`} onClick={onCancel}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.headerRow}>
          <h2 className={styles.heading}>{heading}</h2>
        </div>

        <div className={styles.bodyGroup}>
          {body.map((paragraph) => (
            <p key={paragraph} className={styles.body}>
              {paragraph}
            </p>
          ))}
        </div>

        <div className={styles.buttonRow}>
          {!hideCancel && (
            <button type="button" className={styles.buttonSecondary} onClick={onCancel} disabled={confirmDisabled}>
              Cancel
            </button>
          )}
          <button type="button" className={styles.button} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
