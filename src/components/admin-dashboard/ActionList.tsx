import type { ReactElement } from "react";
import type { ActionGroup, IconKey } from "../../types";
import {
  BrowseIconFilled,
  PlusIconSmallFilled,
  PrinterIconFilled,
  ArrowUpLeftFilled,
  ArrowDownRightFilled,
  ServerIconFilled,
  UserProfileIconFilled,
  MailNewIconFilled,
  MailAllIconFilled,
  MailReplyIconFilled,
  ChevronRightFilled,
} from "./icons";
import styles from "./AdminHome.module.css";

interface ActionListProps {
  groups: ActionGroup[];
  showCategoryLabels?: boolean;
  onSelect?: (actionId: string) => void;
}

const actionIcons: Record<IconKey, ReactElement> = {
  inventory: <BrowseIconFilled size={22} className={styles.actionRowIcon} />,
  add: <PlusIconSmallFilled size={13} className={styles.actionRowIcon} />,
  label: <PrinterIconFilled size={21} className={styles.actionRowIcon} />,
  checkout: <ArrowUpLeftFilled size={15} className={styles.actionRowIcon} />,
  return: <ArrowDownRightFilled size={15} className={styles.actionRowIcon} />,
  list: <ServerIconFilled size={17} className={styles.actionRowIcon} />,
  members: <UserProfileIconFilled size={22} className={styles.actionRowIcon} />,
  "mail-member": <MailNewIconFilled size={22} className={styles.actionRowIcon} />,
  "mail-admin": <MailAllIconFilled size={22} className={styles.actionRowIcon} />,
  "mail-log": <MailReplyIconFilled size={22} className={styles.actionRowIcon} />,
}

export function ActionList({ groups, showCategoryLabels = true, onSelect }: ActionListProps) {
  if (groups.length === 0) {
    return <p className="action-list__empty">No actions match your search.</p>;
  }

  return (
    <div className={styles.actionsCard}>
      {groups.map((group) => (
        <section className={styles.actionGroup} key={group.category}>
          {showCategoryLabels && <h2 className={styles.actionGroupTitle}>{group.category}</h2>}
          <div className={styles.actionGroupItems}>
            {group.items.map((item) => (
              <button
                className={styles.actionRow}
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item.id)}
              >
                <span className={styles.actionRowLeft}>
                  <span className={styles.actionRowIconBox}>{actionIcons[item.icon]}</span>
                  <span className={styles.actionRowLabel}>{item.label}</span>
                </span>
                <ChevronRightFilled size={9} className={styles.actionRowChevron} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
