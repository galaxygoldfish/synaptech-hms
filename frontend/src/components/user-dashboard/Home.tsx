import { useEffect, useState } from "react";
import { fetchMemberActions, fetchMemberDashboard } from "./api";
import { ActionList } from "./ActionList";
import { CheckoutCallToAction } from "./CheckoutCallToAction";
import { Header } from "./Header";
import { InlineOverdueWarning } from "./InlineOverdueWarning";
import { MyHardwareCard } from "./MyHardwareCard";
import { OverdueWarningModal } from "./OverdueWarningModal";
import { ProfileModal } from "./ProfileModal";
import type { LoanSummary, MemberActionItem } from "./types";
import type { UserProfile } from "../../types";

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loan, setLoan] = useState<LoanSummary | null>(null);
  const [hasOverdueLoan, setHasOverdueLoan] = useState(false);
  const [actions, setActions] = useState<MemberActionItem[]>([]);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isWarningOpen, setWarningOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchMemberDashboard(), fetchMemberActions()])
      .then(([dashboard, actionsRes]) => {
        if (cancelled) return;
        setUser(dashboard.user);
        setLoan(dashboard.loan);
        setHasOverdueLoan(dashboard.hasOverdueLoan);
        setActions(actionsRes.items);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the dashboard. Check that the API server is running.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckoutClick = () => {
    if (hasOverdueLoan) {
      setWarningOpen(true);
      return;
    }
    // Placeholder: wire this up to the checkout request flow once it's built.
    // eslint-disable-next-line no-console
    console.log("Navigate to: request to check out hardware");
  };

  const handleMoreDetails = () => {
    // Placeholder: wire this up to a loan detail screen once it's built.
    // eslint-disable-next-line no-console
    console.log("Navigate to: loan details");
  };

  const handleAction = (actionId: string) => {
    // Placeholder: wire this up to routing / real screens as they're built.
    // eslint-disable-next-line no-console
    console.log("Navigate to action:", actionId);
  };

  const handleLogOut = () => {
    setProfileOpen(false);
    // Placeholder for real auth/session teardown.
    // eslint-disable-next-line no-console
    console.log("User logged out");
  };

  if (isLoading) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text status-text--error">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header userName={user.name.split(" ")[0]} onProfileClick={() => setProfileOpen(true)} />

      <main className="app-main">
        <MyHardwareCard loan={loan} onMoreDetails={handleMoreDetails} />

        <div className="app-main__row">
          <div className={`checkout-cta-wrap${isWarningOpen ? " checkout-cta-wrap--warning" : ""}`}>
            <CheckoutCallToAction disabled={hasOverdueLoan} onClick={handleCheckoutClick} />
            {hasOverdueLoan && <InlineOverdueWarning onDismiss={() => setWarningOpen(false)} />}
          </div>
          <div className="app-main__body app-main__body--actions">
            <ActionList items={actions} onSelect={handleAction} />
          </div>
        </div>
      </main>

      {isProfileOpen && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {isWarningOpen && hasOverdueLoan && <OverdueWarningModal onClose={() => setWarningOpen(false)} />}
    </div>
  );
}
