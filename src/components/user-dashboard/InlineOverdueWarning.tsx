import { WarningIcon } from "./icons";
import styles from "./Home.module.css";

interface InlineOverdueWarningProps {
  open: boolean;
  onDismiss: () => void;
}

export function InlineOverdueWarning({ open, onDismiss }: InlineOverdueWarningProps) {
  return (
    <div
      className={`${styles.overdueBubble} ${open ? styles.overdueBubbleOpen : ""}`}
      role="tooltip"
      onClick={onDismiss}
    >
      <WarningIcon size={32} />
      <p className={styles.overdueBubbleText}>
        You must return all overdue hardware before you can check out more
      </p>
    </div>
  );
}
