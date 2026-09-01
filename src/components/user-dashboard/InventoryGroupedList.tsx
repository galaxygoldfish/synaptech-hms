import { ChevronRightFilled } from './icons'
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
  if (isLoading) return <p className={styles.status}>Loading inventory…</p>
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
