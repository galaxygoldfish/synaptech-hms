import { homeLoanTone, type HomeLoanTone, type MemberLoanItem } from "../../lib/memberLoans";
import { CognitiveBrainIconFilled, DeviceIcon } from "./icons";
import { Skeleton, SkeletonScreen } from "../skeleton/Skeleton";
import styles from "./Home.module.css";

interface MyHardwareCardProps {
  /** The hardware the member has out right now. */
  loans: MemberLoanItem[];
  /** While true the card shimmers instead of claiming there are no loans —
      `loans` is also empty before the fetch resolves, so the two states have
      to be told apart explicitly. */
  isLoading?: boolean;
  onMoreDetails: (loan: MemberLoanItem) => void;
}

function formatDate(isoDate: string): string {
  // Date-only strings parse as UTC midnight, which is the previous evening in
  // the Americas; anchoring to local midnight keeps the day the admin chose.
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const TONE_CLASS: Record<HomeLoanTone, string> = {
  active: "",
  due_soon: styles.loanCardDueSoon,
  overdue: styles.loanCardOverdue,
};

export function MyHardwareCard({ loans, isLoading = false, onMoreDetails }: MyHardwareCardProps) {
  return (
    <section className={styles.hardwareCard} aria-busy={isLoading}>
      <h2 className={styles.hardwareLabel}>My hardware</h2>

      {isLoading && (
        <SkeletonScreen label="Loading your hardware loans…">
          <div className={styles.loanGrid}>
            <div className={styles.loanCard}>
              <div className={styles.loanCardInner}>
                <Skeleton width="6.5rem" height="4.5rem" radius="0.625rem" />
                <Skeleton width="60%" height="1.5rem" shape="pill" style={{ marginTop: "1rem" }} />
                <Skeleton width="80%" height="0.875rem" shape="pill" style={{ marginTop: "0.5rem" }} />
                <Skeleton width="45%" height="1rem" shape="pill" style={{ marginTop: "0.75rem" }} />
              </div>
            </div>
          </div>
        </SkeletonScreen>
      )}

      {!isLoading && loans.length === 0 && (
        <div className={styles.hardwareEmpty}>
          <CognitiveBrainIconFilled size={104} className={styles.hardwareEmptyIcon} />
          <p className={styles.hardwareEmptyText}>You don&rsquo;t have any active hardware loans</p>
        </div>
      )}

      {!isLoading && loans.length > 0 && (
        <ul className={styles.loanGrid}>
          {loans.map((loan) => (
            <li key={loan.id} className={`${styles.loanCard} ${TONE_CLASS[homeLoanTone(loan)]}`}>
              {/* Padding and content layout live here, not on .loanCard —
                  .loanCard is the square (tablet/desktop, see the module
                  CSS) sized by aspect-ratio, and aspect-ratio measures
                  against a box that doesn't also carry its own padding. The
                  whole card opens the loan's details — "More details" below
                  is a plain span, not its own nested button, now that the
                  card itself is the button. */}
              <button
                type="button"
                className={styles.loanCardInner}
                onClick={() => onMoreDetails(loan)}
                aria-label={`More details about ${loan.itemName}`}
              >
                <div className={styles.loanThumb} aria-hidden="true">
                  {loan.imageUrl ? <img src={loan.imageUrl} alt="" /> : <DeviceIcon size={40} />}
                </div>
                <p className={styles.loanName}>{loan.itemName}</p>
                {loan.returnDate && <p className={styles.loanDate}>Return by {formatDate(loan.returnDate)}</p>}
                <span className={styles.loanLink}>More details →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
