import type { LoanSummary } from "./types";
import { CognitiveBrainIconFilled, DeviceIcon } from "./icons";
import { Skeleton, SkeletonScreen } from "../skeleton/Skeleton";
import styles from "./Home.module.css";

interface MyHardwareCardProps {
  loan: LoanSummary | null;
  /** While true the card shimmers instead of claiming there are no loans —
      `loan` is also null before the fetch resolves, so the two states have
      to be told apart explicitly. */
  isLoading?: boolean;
  onMoreDetails: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "2-digit", year: "numeric" });
}

const statusClass: Record<LoanSummary["status"], string> = {
  ACTIVE: "hardware-card--active",
  DUE_SOON: "hardware-card--due-soon",
  OVERDUE: "hardware-card--overdue",
};

export function MyHardwareCard({ loan, isLoading = false, onMoreDetails }: MyHardwareCardProps) {
  return (
    <section className={styles.hardwareCard} aria-busy={isLoading}>
      <h2 className={styles.hardwareLabel}>My hardware</h2>

      {isLoading && (
        <SkeletonScreen label="Loading your hardware loan…">
          <div className="hardware-card hardware-card--active">
            <div className="hardware-card__thumb">
              <Skeleton width={64} height={64} radius="var(--radius-md)" />
            </div>
            <div className="hardware-card__info" style={{ flex: 1 }}>
              <Skeleton width="45%" height={15} shape="pill" style={{ marginBottom: 8 }} />
              <Skeleton width="60%" height={13} shape="pill" style={{ marginBottom: 10 }} />
              <Skeleton width="30%" height={13} shape="pill" />
            </div>
          </div>
        </SkeletonScreen>
      )}

      {!isLoading && !loan && (
        <div className={styles.hardwareEmpty}>
          <CognitiveBrainIconFilled size={104} className={styles.hardwareEmptyIcon} />
          <p className={styles.hardwareEmptyText}>You don&rsquo;t have any active hardware loans</p>
        </div>
      )}

      {!isLoading && loan && (
        <div className={`hardware-card ${statusClass[loan.status]}`}>
          <div className="hardware-card__thumb" aria-hidden="true">
            {loan.imageUrl ? <img src={loan.imageUrl} alt="" /> : <DeviceIcon />}
          </div>
          <div className="hardware-card__info">
            <div className="hardware-card__name">{loan.itemName}</div>
            <div className="hardware-card__date">Return by {formatDate(loan.returnByDate)}</div>
            <button className="hardware-card__link" onClick={onMoreDetails} type="button">
              More details →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
