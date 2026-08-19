import { useNavigate } from "react-router-dom";
import type { DashboardStats } from "../../types";
import styles from "./AdminHome.module.css";

interface StatCardsProps {
  stats: DashboardStats;
}

const cardConfig: {
  key: keyof DashboardStats;
  label: string;
  tone: "blue" | "red" | "olive" | "green";
  filter: "active" | "overdue" | "requests" | "returns";
}[] = [
  { key: "activeLoans", label: "Active hardware loans", tone: "blue", filter: "active" },
  { key: "overdueLoans", label: "Overdue loans", tone: "red", filter: "overdue" },
  { key: "pendingRequests", label: "Pending requests", tone: "olive", filter: "requests" },
  { key: "pendingReturns", label: "Pending returns", tone: "green", filter: "returns" },
];

const toneClass = {
  blue: styles.statCardBlue,
  red: styles.statCardRed,
  olive: styles.statCardOlive,
  green: styles.statCardGreen,
};

export function StatCards({ stats }: StatCardsProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.statRow}>
      {cardConfig.map((card) => (
        <button
          type="button"
          className={`${styles.statCard} ${toneClass[card.tone]}`}
          key={card.key}
          onClick={() => navigate(`/adminHome/loans?filter=${card.filter}`)}
        >
          <div className={styles.statCardValue}>{stats[card.key]}</div>
          <div className={styles.statCardLabel}>{card.label}</div>
        </button>
      ))}
    </div>
  );
}
