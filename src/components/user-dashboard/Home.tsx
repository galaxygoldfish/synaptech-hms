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
import { activeHardwareLoans, fetchMemberLoanItem, homeLoanTone, type MemberLoanItem } from "../../lib/memberLoans";
import { useMemberLoans } from "../../lib/useMemberLoans";
import styles from "./Home.module.css";
import { usePrefetchNavigate } from "../../lib/usePrefetchNavigate";
import { memberLoanItemKey } from "../../lib/detailKeys";

export default function Home() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isWarningOpen, setWarningOpen] = useState(false);

  // Shown from cache at once when there is one, then refreshed — see
  // useMemberLoans. The overdue block on checkout must not be decided from a
  // stale list, so a click that lands before the fresh copy is held and
  // decided when it arrives. Here a failed refresh is an error even with a
  // cached list showing, since that list can't be trusted for the decision.
  const { groups, isFresh, failed, refreshFailed } = useMemberLoans(profile?.id);
  const loans = useMemo(() => (groups ? activeHardwareLoans(groups) : []), [groups]);
  const isLoading = groups === null && !failed;
  const error = failed || refreshFailed ? "Couldn't load your hardware loans." : null;
  const [isCheckoutPending, setCheckoutPending] = useState(false);

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
    if (!isFresh) {
      setCheckoutPending(true);
      return;
    }
    if (hasOverdueLoan) {
      setWarningOpen(true);
      return;
    }
    navigate("/home/checkout");
  };

  useEffect(() => {
    if (!isCheckoutPending || !isFresh) return;
    setCheckoutPending(false);
    if (hasOverdueLoan) setWarningOpen(true);
    else navigate("/home/checkout");
  }, [isCheckoutPending, isFresh, hasOverdueLoan, navigate]);

  const { open } = usePrefetchNavigate();
  const handleMoreDetails = (loan: MemberLoanItem) => {
    void open(memberLoanItemKey(loan.id), () => fetchMemberLoanItem(loan.id), `/home/loans/${loan.id}`);
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
      <Header userName={user.name} onProfileClick={() => setProfileOpen(true)} />

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
