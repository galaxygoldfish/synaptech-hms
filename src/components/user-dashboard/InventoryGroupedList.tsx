import { ChevronRightFilled } from './icons'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import type { InventoryGroup } from '../../lib/useInventoryCatalog'
import type { Equipment } from '../../types'
import styles from './InventoryGroupedList.module.css'

interface InventoryGroupedListProps {
  groups: InventoryGroup[]
  isLoading: boolean
  error: string | null
  emptyMessage?: string
  /** When provided, each row becomes a button that calls this on click. */
  onSelectItem?: (item: Equipment) => void
}

export function InventoryGroupedList({
  groups,
  isLoading,
  error,
  emptyMessage = 'No items match your search.',
  onSelectItem,
}: InventoryGroupedListProps) {
  // Two stand-in groups of three rows: enough to fill the fold without
  // promising more items than a short catalogue actually has.
  if (isLoading) {
    return (
      <SkeletonScreen label="Loading inventory…" className={styles.skeletonGroups}>
        {Array.from({ length: 2 }, (_, groupIndex) => (
          <section key={groupIndex} className={styles.group}>
            <Skeleton width="9rem" height="1.25rem" shape="pill" />
            <ul className={styles.itemList}>
              {Array.from({ length: 3 }, (_, itemIndex) => (
                <li key={itemIndex} className={styles.item}>
                  <Skeleton width="6.5rem" height="6.5rem" radius="0.625rem" className={styles.itemThumb} />
                  <div className={styles.itemInfo}>
                    <Skeleton width="55%" height="1.5625rem" shape="pill" />
                    <Skeleton width="85%" height="1.0625rem" shape="pill" />
                    <Skeleton width="30%" height="1.0625rem" shape="pill" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </SkeletonScreen>
    )
  }
  if (error) return <p className={styles.status}>{error}</p>
  if (groups.length === 0) return <p className={styles.status}>{emptyMessage}</p>

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <h2 className={styles.groupLabel}>{group.label}</h2>
          <ul className={styles.itemList}>
            {group.items.map((item) => {
              const content = (
                <>
                  {item.image_url && <img src={item.image_url} alt="" className={styles.itemThumb} />}
                  <div className={styles.itemInfo}>
                    <p className={styles.itemName}>{item.name}</p>
                    {item.description && <p className={styles.itemDescription}>{item.description}</p>}
                    <p className={styles.itemAvailable}>{item.quantity_total} available</p>
                  </div>
                  <ChevronRightFilled size={9} color="rgba(0, 0, 0, 0.35)" className={styles.itemChevron} />
                </>
              )

              if (onSelectItem) {
                return (
                  <li key={item.id}>
                    <button type="button" className={styles.itemButton} onClick={() => onSelectItem(item)}>
                      {content}
                    </button>
                  </li>
                )
              }

              return (
                <li key={item.id} className={styles.item}>
                  {content}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
