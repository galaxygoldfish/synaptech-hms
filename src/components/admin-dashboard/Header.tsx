import { UserIconFilled } from "./icons";
import { BrandWordmark } from "../BrandWordmark";
import styles from "./AdminHome.module.css";

interface HeaderProps {
  userName: string;
  onProfileClick: () => void;
}

export function Header({ userName, onProfileClick }: HeaderProps) {
  return (
    <header className={styles.header}>
      <BrandWordmark mutedText="Hardware Management" hideHardwareOnMobile compact />
      <button className={styles.profilePill} onClick={onProfileClick} type="button">
        <UserIconFilled size={15} className={styles.profilePillIcon} />
        <span className={styles.profilePillName}>{userName}</span>
      </button>
    </header>
  );
}
