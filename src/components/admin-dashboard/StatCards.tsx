import type { DashboardStats } from "../../types";

interface StatCardsProps {
  stats: DashboardStats;
}

const cardConfig: { key: keyof DashboardStats; label: string; tone: "blue" | "red" | "olive" | "green" }[] = [
  { key: "activeLoans", label: "Active hardware loans", tone: "blue" },
  { key: "overdueLoans", label: "Overdue loans", tone: "red" },
  { key: "pendingRequests", label: "Pending requests", tone: "olive" },
  { key: "pendingReturns", label: "Pending returns", tone: "green" },
];

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="stat-row">
      {cardConfig.map((card) => (
        <div className={`stat-card stat-card--${card.tone}`} key={card.key}>
          <div className="stat-card__value">{stats[card.key]}</div>
          <div className="stat-card__label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
