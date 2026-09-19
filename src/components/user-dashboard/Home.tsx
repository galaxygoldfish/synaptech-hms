import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionList } from "./ActionList";
import { CheckoutCallToAction } from "./CheckoutCallToAction";
import { Header } from "./Header";
import { InlineOverdueWarning } from "./InlineOverdueWarning";
import { MyHardwareCard } from "./MyHardwareCard";
import { OverdueWarningModal } from "./OverdueWarningModal";
import { ProfileModal } from "./ProfileModal";
import type { UserProfile } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { memberActions } from "../../data/memberActions";
import { fetchActiveHardwareLoans, homeLoanTone, type MemberLoanItem } from "../../lib/memberLoans";
import styles from "./Home.module.css";

export default function Home() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [loans, setLoans] = useState<MemberLoanItem[]>([]);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isWarningOpen, setWarningOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    fetchActiveHardwareLoans(profile.id)
      .then((activeLoans) => {
        if (!cancelled) setLoans(activeLoans);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your hardware loans.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null;
    return {
      name: `${profile.first_name} ${profile.last_name}`,
      role: profile.role === "admin" ? "ADMINISTRATOR" : "MEMBER",
      email: profile.uw_email,
      handle: profile.discord,
      location: profile.address,
    };
  }, [profile]);

  // Any one overdue item blocks new checkouts until it is back.
  const hasOverdueLoan = loans.some((loan) => homeLoanTone(loan) === "overdue");

  const handleCheckoutClick = () => {
    if (isLoading) return;
    if (hasOverdueLoan) {
      setWarningOpen(true);
      return;
    }
    navigate("/home/checkout");
  };

  const handleMoreDetails = (loan: MemberLoanItem) => {
    navigate(`/home/loans/${loan.id}`);
  };

  const handleAction = (actionId: string) => {
    if (actionId === "browse-inventory") {
      navigate("/home/browse");
      return;
    }
    if (actionId === "my-hardware-loans") {
      navigate("/home/loans");
      return;
    }
    // Placeholder: wire this up to routing / real screens as they're built.
    // eslint-disable-next-line no-console
    console.log("Navigate to action:", actionId);
  };

  const handleLogOut = () => {
    setProfileOpen(false);
    signOut();
  };

  // Only the active loans come from the network. The header, checkout CTA
  // and action list are all local, so the shell renders straight away and
  // only the hardware section shimmers.
  if (error || !user) {
    return (
      <div className="app-shell app-shell--centered">
        <p className="status-text status-text--error">{error ?? "Something went wrong."}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header userName={user.name.split(" ")[0]} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <MyHardwareCard loans={loans} isLoading={isLoading} onMoreDetails={handleMoreDetails} />

        <div className={styles.row}>
          <div className={styles.ctaWrap}>
            {/* `disabled` (truly inert) only while loading; once loans are
                in, an overdue member sees `blocked` instead — the button
                stays clickable/hoverable so it can open the warning below. */}
            <CheckoutCallToAction disabled={isLoading} blocked={hasOverdueLoan} onClick={handleCheckoutClick} />
            {hasOverdueLoan && (
              <InlineOverdueWarning open={isWarningOpen} onDismiss={() => setWarningOpen(false)} />
            )}
          </div>
          <div className={styles.actionListCard}>
            <ActionList items={memberActions} onSelect={handleAction} />
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
