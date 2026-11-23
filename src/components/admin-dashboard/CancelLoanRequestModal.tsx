import { useEffect, useRef } from 'react'
import modalStyles from '../Modal.module.css'
import styles from './CancelLoanRequestModal.module.css'
import { ModalDialog } from '../ModalDialog'

/** Long enough for a sentence or two of explanation, short enough to stay an
    explanation rather than a letter — it goes into an email verbatim. */
export const CANCELLATION_REASON_MAX_LENGTH = 500

interface CancelLoanRequestModalProps {
  isOpen: boolean
  memberName: string
  reason: string
  error: string | null
  isSubmitting: boolean
  onChange: (reason: string) => void
  onConfirm: () => void
  onCancel: () => void
  /**
   * Wording, for reusing this dialog to deny a loan extension — the same
   * required, emailed reason. Defaults are the checkout-cancellation copy.
   */
  copy?: Partial<ReasonDialogCopy>
}

export interface ReasonDialogCopy {
  heading: string
  /** Follows the member's name. */
  body: string
  label: string
  placeholder: string
  keepLabel: string
  confirmLabel: string
  submittingLabel: string
}

const CANCEL_COPY: ReasonDialogCopy = {
  heading: 'Cancel this checkout request?',
  body: 'will be emailed the reason below. Their hardware is released for other members.',
  label: 'Reason for cancelling',
  placeholder: "e.g. This unit failed inspection and can't be lent out right now.",
  keepLabel: 'Keep request',
  confirmLabel: 'Cancel request',
  submittingLabel: 'Cancelling…',
}

/**
 * Asking an admin why before cancelling a checkout request.
 *
 * Built on Modal.module.css like SerialEntryModal, and for the same reason
 * it isn't a ConfirmActionModal: the field is the one part that couldn't
 * render. The reason is required — the member is emailed it (the REASON chip
 * in checkout-request-cancellation), and an email saying "your request was
 * cancelled" with nothing after "Reason:" is worse than no email.
 */
export function CancelLoanRequestModal({
  isOpen,
  memberName,
  reason,
  error,
  isSubmitting,
  onChange,
  onConfirm,
  onCancel,
  copy,
}: CancelLoanRequestModalProps) {
  const text = { ...CANCEL_COPY, ...copy }
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Opening this dialog is the decision to cancel; what's left is the typing.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className={`${modalStyles.overlay} ${modalStyles.overlayWelcome}`} onClick={isSubmitting ? undefined : onCancel}>
      <ModalDialog
        className={`${modalStyles.modal} ${modalStyles.modalWide}`}
        aria-label={text.heading}
        onClose={isSubmitting ? undefined : onCancel}
      >
        <div className={modalStyles.headerRow}>
          <h2 className={modalStyles.heading}>{text.heading}</h2>
        </div>

        <div className={modalStyles.bodyGroup}>
          <p className={modalStyles.body}>
            {memberName} {text.body}
          </p>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="cancellation-reason">
            {text.label}
          </label>
          <textarea
            id="cancellation-reason"
            ref={inputRef}
            className={styles.textarea}
            value={reason}
            maxLength={CANCELLATION_REASON_MAX_LENGTH}
            rows={4}
            placeholder={text.placeholder}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error !== null}
            disabled={isSubmitting}
          />
          <div className={styles.fieldFooter}>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : (
              <span />
            )}
            <span className={styles.counter}>
              {reason.length}/{CANCELLATION_REASON_MAX_LENGTH}
            </span>
          </div>
        </div>

        <div className={modalStyles.buttonRow}>
          <button
            type="button"
            className={modalStyles.buttonSecondary}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {text.keepLabel}
          </button>
          <button
            type="button"
            className={`${modalStyles.button} ${styles.confirmButton}`}
            onClick={onConfirm}
            disabled={!reason.trim() || isSubmitting}
          >
            {isSubmitting ? text.submittingLabel : text.confirmLabel}
          </button>
        </div>
      </ModalDialog>
    </div>
  )
}
