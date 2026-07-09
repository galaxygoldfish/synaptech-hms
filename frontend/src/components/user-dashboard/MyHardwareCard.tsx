import type { LoanSummary } from "./types";
import { BrainOutlineIcon, DeviceIcon } from "./icons";

interface MyHardwareCardProps {
  loan: LoanSummary | null;
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

export function MyHardwareCard({ loan, onMoreDetails }: MyHardwareCardProps) {
  return (
    <section className="hardware-section">
      <h2 className="action-group__title">My hardware</h2>

      {!loan && (
        <div className="hardware-card hardware-card--empty">
          <BrainOutlineIcon />
          <p>You don't have any active hardware loans.</p>
        </div>
      )}

      {loan && (
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
