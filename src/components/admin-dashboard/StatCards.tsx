import { useNavigate } from "react-router-dom";
import { Skeleton } from "../skeleton/Skeleton";
import type { DashboardStats } from "../../types";
import styles from "./AdminHome.module.css";

interface StatCardsProps {
  /** `null` while the counts are still loading — the card renders its
      label and colour immediately and shimmers only the number. */
  stats: DashboardStats | null;
}

const cardConfig: {
  key: keyof DashboardStats;
  label: string;
  /** Shown in place of `label` on phone, where the card is just the number
   *  in a 2x2 grid and the full label no longer fits under it. Tablet keeps
   *  the full label — see the 480px vs. 900px breakpoints below. */
  shortLabel: string;
  tone: "blue" | "red" | "olive" | "green";
  filter: "active" | "overdue" | "requests" | "returns";
}[] = [
  { key: "activeLoans", label: "Active hardware loans", shortLabel: "Active", tone: "blue", filter: "active" },
  { key: "overdueLoans", label: "Overdue loans", shortLabel: "Overdue", tone: "red", filter: "overdue" },
  { key: "pendingRequests", label: "Pending requests", shortLabel: "Requests", tone: "olive", filter: "requests" },
  { key: "pendingReturns", label: "Pending returns", shortLabel: "Returns", tone: "green", filter: "returns" },
];

const toneClass = {
  blue: styles.statCardBlue,
  red: styles.statCardRed,
  olive: styles.statCardOlive,
  green: styles.statCardGreen,
};

export function StatCards({ stats }: StatCardsProps) {
  const navigate = useNavigate();
  const isLoading = stats === null;

  return (
    <div className={styles.statRow} aria-busy={isLoading}>
      {cardConfig.map((card) => (
        <button
          type="button"
          className={`${styles.statCard} ${toneClass[card.tone]}`}
          key={card.key}
          disabled={isLoading}
          onClick={() => navigate(`/adminHome/loans?filter=${card.filter}`)}
        >
          <div className={styles.statCardValue}>
            {isLoading ? (
              <Skeleton
                width="2ch"
                height="1em"
                radius="0.25em"
                style={{ margin: "0 auto", opacity: 0.55 }}
              />
            ) : (
              stats[card.key]
            )}
          </div>
          <div className={styles.statCardLabel}>{card.label}</div>
          <div className={styles.statCardLabelShort} aria-hidden="true">{card.shortLabel}</div>
        </button>
      ))}
    </div>
  );
}
