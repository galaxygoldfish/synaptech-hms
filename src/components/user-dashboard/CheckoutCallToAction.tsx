import { PlusIconFilled } from "./icons";
import styles from "./Home.module.css";

interface CheckoutCallToActionProps {
  /** Genuinely inert — nothing to act on yet (still loading). */
  disabled: boolean;
  /** Styled and announced as disabled, but stays a real, clickable button —
      blocked by an overdue loan, `onClick` opens the warning explaining why. */
  blocked?: boolean;
  onClick: () => void;
}

export function CheckoutCallToAction({ disabled, blocked = false, onClick }: CheckoutCallToActionProps) {
  return (
    <button
      className={`${styles.checkoutCta} ${blocked ? styles.checkoutCtaBlocked : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || blocked}
    >
      <PlusIconFilled size={54} className={styles.checkoutCtaIcon} />
      <span className={styles.checkoutCtaTitle}>
        <span className={styles.checkoutCtaTitleDesktop}>
          check out
          <br />
          hardware
        </span>
        <span className={styles.checkoutCtaTitleMobile}>Get hardware</span>
      </span>
      <span className={styles.checkoutCtaSubtitle}>
        Start a new request to check out neurotech hardware
      </span>
    </button>
  );
}
