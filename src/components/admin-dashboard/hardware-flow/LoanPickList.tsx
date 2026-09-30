import {
  CalendarIcon,
  ChevronRightIcon,
  ImagePlaceholderIconFilled,
  PersonIcon,
} from '../icons'
import type { AdminLoanRequestItemSummary } from '../../../lib/loanRequests'
import { Skeleton, SkeletonScreen } from '../../skeleton/Skeleton'
import styles from './HardwareFlow.module.css'

/**
 * The list a flow falls back to when the barcode can't help: a label that has
 * come off, or a requested item that never had a serial assigned to scan.
 *
 * Each flow passes the loans it can act on, so every row here does the same
 * thing and none carries a status badge — that's the whole reason this isn't
 * the "Hardware loans" screen with a filter on it. That screen is a record of
 * every loan there has ever been, and what it offers a row depends on the
 * state that row is in.
 */

function formatTimestampDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

interface LoanPickListProps {
  loans: AdminLoanRequestItemSummary[]
  isLoading: boolean
  error: string | null
  /** Shown when nothing is waiting — each flow words its own. */
  emptyMessage: string
  loadingLabel: string
  /** The date each row reports, which differs by direction of travel. */
  dateFor: (loan: AdminLoanRequestItemSummary) => string
  /** Names the action for assistive tech, e.g. "Hand over X to Y". */
  rowLabel: (loan: AdminLoanRequestItemSummary) => string
  onPick: (loan: AdminLoanRequestItemSummary) => void
}

export function LoanPickList({
  loans,
  isLoading,
  error,
  emptyMessage,
  loadingLabel,
  dateFor,
  rowLabel,
  onPick,
}: LoanPickListProps) {
  return (
    <div className={styles.pickCard}>
      {isLoading && (
        <SkeletonScreen label={loadingLabel}>
          <ul className={styles.pickList}>
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index}>
                <div className={styles.pickSkeletonRow}>
                  <Skeleton width="5rem" height="3.5rem" radius="0.5rem" style={{ gridArea: 'thumb' }} />
                  <div
                    style={{
                      gridArea: 'info',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <Skeleton width="70%" height="1.5625rem" shape="pill" />
                    <Skeleton width="45%" height="1.25rem" shape="pill" />
                  </div>
                  <Skeleton width="10rem" height="1.25rem" shape="pill" style={{ gridArea: 'member' }} />
                  <Skeleton width="13rem" height="1.25rem" shape="pill" style={{ gridArea: 'date' }} />
                  <Skeleton width="1.25rem" height="1.25rem" shape="pill" style={{ gridArea: 'chevron' }} />
                </div>
              </li>
            ))}
          </ul>
        </SkeletonScreen>
      )}

      {!isLoading && error && <p className={styles.status}>{error}</p>}

      {!isLoading && !error && loans.length === 0 && <p className={styles.status}>{emptyMessage}</p>}

      {!isLoading && !error && loans.length > 0 && (
        <ul className={styles.pickList}>
          {loans.map((loan) => (
            <li key={loan.id}>
              <button
                type="button"
                className={styles.pickItem}
                onClick={() => onPick(loan)}
                aria-label={rowLabel(loan)}
              >
                {loan.imageUrl ? (
                  <img src={loan.imageUrl} alt="" className={styles.pickThumb} />
                ) : (
                  <span className={styles.pickThumbEmpty}>
                    <ImagePlaceholderIconFilled size={24} />
                  </span>
                )}

                <div className={styles.pickInfo}>
                  <p className={styles.pickName}>{loan.itemName}</p>
                  {loan.serialNumber ? (
                    <p className={styles.pickSerial}>{loan.serialNumber}</p>
                  ) : (
                    // Half the reason this screen exists — an item with no
                    // serial can't be scanned or typed — so it says so rather
                    // than leaving a gap.
                    <p className={`${styles.pickSerial} ${styles.pickSerialMissing}`}>
                      No serial assigned
                    </p>
                  )}
                </div>

                <div className={styles.pickMember}>
                  <PersonIcon size={20} className={styles.pickRowIcon} />
                  <span>{loan.memberName}</span>
                </div>

                <div className={styles.pickDate}>
                  <CalendarIcon size={20} className={styles.pickRowIcon} />
                  <span>{dateFor(loan)}</span>
                </div>

                <ChevronRightIcon size={20} className={styles.pickChevron} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { formatTimestampDate }
