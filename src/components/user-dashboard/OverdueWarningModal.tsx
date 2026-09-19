import { WarningIcon } from "./icons";
import styles from "./Home.module.css";

interface OverdueWarningModalProps {
  onClose: () => void;
}

export function OverdueWarningModal({ onClose }: OverdueWarningModalProps) {
  return (
    <div className={styles.overdueModalOverlay} onClick={onClose}>
      <div className={styles.overdueModal} onClick={(event) => event.stopPropagation()}>
        <WarningIcon size={36} />
        <p className={styles.overdueModalText}>
          You must return all overdue hardware before you can check out more
        </p>
        <button className={styles.overdueModalOk} onClick={onClose} type="button">
          OK
        </button>
      </div>
    </div>
  );
}
