import type { MemberActionItem } from "./types";
import { ActionIcon, ChevronRightIcon } from "./icons";

interface ActionListProps {
  items: MemberActionItem[];
  onSelect?: (actionId: string) => void;
}

export function ActionList({ items, onSelect }: ActionListProps) {
  if (items.length === 0) {
    return <p className="action-list__empty">No actions match your search.</p>;
  }

  return (
    <div className="action-group__items">
      {items.map((item) => (
        <button className="action-row" key={item.id} type="button" onClick={() => onSelect?.(item.id)}>
          <span className="action-row__icon">
            <ActionIcon icon={item.icon} />
          </span>
          <span className="action-row__label">
            <span className="action-row__label-desktop">{item.label}</span>
            <span className="action-row__label-mobile">{item.mobileLabel ?? item.label}</span>
          </span>
          <span className="action-row__chevron">
            <ChevronRightIcon />
          </span>
        </button>
      ))}
    </div>
  );
}
