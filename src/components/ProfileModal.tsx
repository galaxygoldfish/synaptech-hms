import type { UserProfile } from "../types";
import { CloseIcon, HandleIcon, MailIcon, PersonIcon, PinIcon } from "./user-dashboard/icons";
import styles from "./ProfileModal.module.css";
import { ModalDialog } from "./ModalDialog";

interface ProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onLogOut: () => void;
}

export function ProfileModal({ user, onClose, onLogOut }: ProfileModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <ModalDialog className={styles.modal} aria-label="Profile" onClose={onClose}>
        <button className={styles.close} onClick={onClose} type="button" aria-label="Close profile">
          <CloseIcon />
        </button>

        <div className={styles.identity}>
          <PersonIcon className={styles.avatarIcon} />
          <div>
            <div className={styles.name}>{user.name}</div>
            <span className={user.role === "ADMINISTRATOR" ? `${styles.badge} ${styles.badgeAdmin}` : styles.badge}>
              {user.role}
            </span>
          </div>
        </div>

        <ul className={styles.details}>
          <li>
            <MailIcon className={styles.detailIcon} />
            <span>{user.email}</span>
          </li>
          <li>
            <HandleIcon className={styles.detailIcon} />
            <span>{user.handle}</span>
          </li>
          <li>
            <PinIcon className={styles.detailIcon} />
            <span>{user.location}</span>
          </li>
        </ul>

        <button className={styles.logout} onClick={onLogOut} type="button">
          Log out
        </button>
      </ModalDialog>
    </div>
  );
}
