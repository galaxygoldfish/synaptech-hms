import { PlusIconFilled } from "./icons";
import styles from "./Home.module.css";

interface CheckoutCallToActionProps {
  disabled: boolean;
  onClick: () => void;
}

export function CheckoutCallToAction({ disabled, onClick }: CheckoutCallToActionProps) {
  return (
    <button
      className={`checkout-cta ${styles.checkoutCta}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
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
