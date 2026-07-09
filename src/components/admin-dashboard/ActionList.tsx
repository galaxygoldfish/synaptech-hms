import type { ActionGroup } from "../../types";
import { ActionIcon, ChevronRightIcon } from "./icons";

interface ActionListProps {
  groups: ActionGroup[];
  showCategoryLabels?: boolean;
  onSelect?: (actionId: string) => void;
}

export function ActionList({ groups, showCategoryLabels = true, onSelect }: ActionListProps) {
  if (groups.length === 0) {
    return <p className="action-list__empty">No actions match your search.</p>;
  }

  return (
    <div className="action-list">
      {groups.map((group) => (
        <section className="action-group" key={group.category}>
          {showCategoryLabels && <h2 className="action-group__title">{group.category}</h2>}
          <div className="action-group__items">
            {group.items.map((item) => (
              <button
                className="action-row"
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item.id)}
              >
                <span className="action-row__icon">
                  <ActionIcon icon={item.icon} />
                </span>
                <span className="action-row__label">{item.label}</span>
                <span className="action-row__chevron">
                  <ChevronRightIcon />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
