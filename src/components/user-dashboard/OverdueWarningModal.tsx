import { WarningIcon } from "./icons";
import styles from "./Home.module.css";
import { ModalDialog } from "../ModalDialog";

interface OverdueWarningModalProps {
  onClose: () => void;
}

export function OverdueWarningModal({ onClose }: OverdueWarningModalProps) {
  return (
    <div className={styles.overdueModalOverlay} onClick={onClose}>
      <ModalDialog className={styles.overdueModal} aria-label="Overdue hardware" onClose={onClose}>
        <WarningIcon size={36} />
        <p className={styles.overdueModalText}>
          You must return all overdue hardware before you can check out more
        </p>
        <button className={styles.overdueModalOk} onClick={onClose} type="button">
          OK
        </button>
      </ModalDialog>
    </div>
  );
}
