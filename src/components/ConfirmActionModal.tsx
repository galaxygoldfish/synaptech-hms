import styles from './Modal.module.css'

interface ConfirmActionModalProps {
  isOpen: boolean
  heading: string
  body: string[]
  confirmLabel: string
  /** "Cancel" by default — set when the dismiss button isn't backing out of
      an action so much as just closing an informational dialog (e.g. "Close"). */
  cancelLabel?: string
  confirmDisabled?: boolean
  hideCancel?: boolean
  wide?: boolean
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
  cancelLabel = 'Cancel',
  confirmDisabled,
  hideCancel,
  wide,
  onConfirm,
  onCancel,
}: ConfirmActionModalProps) {
  if (!isOpen) return null

  return (
    <div className={`${styles.overlay} ${styles.overlayWelcome}`} onClick={onCancel}>
      {/* Announced as a dialog, named by its own heading — matching the
          modals elsewhere in the app (EmailLog's detail modal, say). Without
          this it was an anonymous div, so assistive tech gave no signal that
          a confirmation had taken over the screen. */}
      <div
        className={wide ? `${styles.modal} ${styles.modalWide}` : styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
      >
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
              {cancelLabel}
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
