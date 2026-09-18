import { ImagePlaceholderIconFilled } from '../icons'
import styles from './HardwareFlow.module.css'

/**
 * The loan a barcode resolved to, repeated back before anything is recorded.
 * Shared by the checkout and return flows — what the rows say differs, that
 * the admin gets to check them against the person in front of them does not.
 */

export interface ConfirmRow {
  label: string
  value: string
  /** Renders the value in the overdue red — for a return date already past. */
  isAlert?: boolean
}

interface LoanConfirmCardProps {
  itemName: string
  /** Null for a requested item that never had a serial assigned. */
  serialNumber: string | null
  imageUrl: string | null
  rows: ConfirmRow[]
  actionLabel: string
  actionDisabled?: boolean
  onAction: () => void
  /** Shown above the action when recording failed. */
  errorMessage?: string | null
}

export function LoanConfirmCard({
  itemName,
  serialNumber,
  imageUrl,
  rows,
  actionLabel,
  actionDisabled,
  onAction,
  errorMessage,
}: LoanConfirmCardProps) {
  return (
    <div className={styles.confirmCard}>
      <div className={styles.confirmHead}>
        {/* Fixed slot whether or not the product has a photo, so the name
            always starts in the same place. */}
        {imageUrl ? (
          <img src={imageUrl} alt="" className={styles.confirmThumb} />
        ) : (
          <span className={styles.confirmThumbEmpty}>
            <ImagePlaceholderIconFilled size={28} />
          </span>
        )}
        <div className={styles.confirmHeadText}>
          <p className={styles.confirmName}>{itemName}</p>
          <p className={styles.confirmSerial}>{serialNumber ?? 'No serial assigned'}</p>
        </div>
      </div>

      <dl className={styles.confirmRows}>
        {rows.map((row) => (
          <div className={styles.confirmRow} key={row.label}>
            <dt className={styles.confirmLabel}>{row.label}</dt>
            <dd
              className={
                row.isAlert
                  ? `${styles.confirmValue} ${styles.confirmValueOverdue}`
                  : styles.confirmValue
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {errorMessage && <p className={styles.inlineError}>{errorMessage}</p>}

      {/* One action out of here. The wrong loan is backed out of with the
          Back button in the top row, which is where every other screen puts
          "not this". */}
      <div className={styles.confirmActions}>
        <button
          type="button"
          className={styles.confirmContinue}
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}
