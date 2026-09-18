import { ImagePlaceholderIconFilled } from './icons'
import type { InventoryAuditStatus } from '../../lib/inventoryAudit'
import styles from './InventoryAudit.module.css'

/**
 * The bits the three inventory-audit screens render identically: the outcome
 * badge, the unit row, and the two date formats. Shared rather than copied so
 * a unit can't read one way while it's being scanned and another way in the
 * report five minutes later.
 */

export const STATUS_LABEL: Record<InventoryAuditStatus, string> = {
  confirmed: 'Confirmed',
  missing: 'Missing',
  checked_out: 'Checked out',
  // Deliberately not "Found checked out", which reads like the scan confirmed
  // the loan: what happened is the unit was on the shelf when the records
  // said it shouldn't have been.
  found_checked_out: 'Found in stock',
  unrecognized: 'Not recognised',
}

export const STATUS_BADGE_CLASS: Record<InventoryAuditStatus, string> = {
  confirmed: styles.badgeConfirmed,
  missing: styles.badgeMissing,
  checked_out: styles.badgeCheckedOut,
  found_checked_out: styles.badgeFoundCheckedOut,
  unrecognized: styles.badgeUnrecognized,
}

/** What each outcome means, spelled out wherever there's room for it. */
export const STATUS_EXPLANATION: Record<InventoryAuditStatus, string> = {
  confirmed: 'Scanned on the shelf, exactly as the records said',
  missing: 'The records placed it in stock, but it was never scanned',
  checked_out: 'Out on an approved loan, so its absence is accounted for',
  found_checked_out: 'Scanned on the shelf although the records say it is out on loan',
  unrecognized: 'A barcode that matches no unit in inventory',
}

export function OutcomeBadge({ status }: { status: InventoryAuditStatus }) {
  return <span className={`${styles.badge} ${STATUS_BADGE_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
}

/** "Sep 18, 2026, 3:04 PM" — the same shape the audit and email logs use. */
export function formatAuditTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Just the clock time, for a scan inside an audit whose date is already known. */
export function formatScanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface UnitRowProps {
  name: string
  serialNumber: string
  imageUrl?: string | null
  /** A second line under the name — who holds it, or why it's listed. */
  note?: string | null
  status?: InventoryAuditStatus
  /** ISO timestamp of the barcode read, shown as a clock time when present. */
  scannedAt?: string | null
}

export function UnitRow({ name, serialNumber, imageUrl, note, status, scannedAt }: UnitRowProps) {
  return (
    <li className={styles.unitRow}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className={styles.unitThumb} />
      ) : (
        <span className={styles.unitThumbEmpty}>
          <ImagePlaceholderIconFilled size={18} />
        </span>
      )}
      <span className={styles.unitInfo}>
        <span className={styles.unitName}>{name}</span>
        <span className={styles.unitMeta}>{note ? `${serialNumber} · ${note}` : serialNumber}</span>
      </span>
      <span className={styles.unitTrailing}>
        {scannedAt && <span className={styles.unitTime}>{formatScanTime(scannedAt)}</span>}
        {status && <OutcomeBadge status={status} />}
      </span>
    </li>
  )
}
