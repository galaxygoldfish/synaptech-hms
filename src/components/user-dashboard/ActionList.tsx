import type { ReactElement } from "react";
import type { MemberActionItem, MemberIconKey } from "./types";
import { BrowseIconFilled, TimeIconFilled, PlusIconSmallFilled, HelpIconFilled, ChevronRightFilled } from "./icons";
import styles from "./Home.module.css";

interface ActionListProps {
  items: MemberActionItem[];
  onSelect?: (actionId: string) => void;
}

const actionIcons: Record<MemberIconKey, ReactElement> = {
  browse: <BrowseIconFilled size={22} className={styles.actionRowIcon} />,
  loans: <TimeIconFilled size={22} className={styles.actionRowIcon} />,
  documentation: <PlusIconSmallFilled size={16} className={styles.actionRowIconPlus} />,
  support: <HelpIconFilled size={22} className={styles.actionRowIcon} />,
}

export function ActionList({ items, onSelect }: ActionListProps) {
  if (items.length === 0) {
    return <p className="action-list__empty">No actions match your search.</p>;
  }

  return (
    <div className={styles.actionListItems}>
      {items.map((item) => {
        const content = (
          <>
            <span className={styles.actionRowLeft}>
              {actionIcons[item.icon]}
              <span className={styles.actionRowLabel}>
                <span className={styles.actionRowLabelDesktop}>{item.label}</span>
                <span className={styles.actionRowLabelMobile}>{item.mobileLabel ?? item.label}</span>
              </span>
            </span>
            <ChevronRightFilled size={9} className={styles.actionRowChevron} />
          </>
        );

        if (item.href) {
          return (
            <a
              className={styles.actionRow}
              key={item.id}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
            </a>
          );
        }

        return (
          <button className={styles.actionRow} key={item.id} type="button" onClick={() => onSelect?.(item.id)}>
            {content}
          </button>
        );
      })}
    </div>
  );
}
