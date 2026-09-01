import { FILTER_OPTIONS, type CategoryFilter } from '../../lib/equipmentCategories'
import { useEdgeFade } from '../../lib/useEdgeFade'
import styles from './InventoryFilterChips.module.css'

interface InventoryFilterChipsProps {
  selected: Set<CategoryFilter>
  onToggle: (value: CategoryFilter) => void
}

export function InventoryFilterChips({ selected, onToggle }: InventoryFilterChipsProps) {
  const { ref, maskImage } = useEdgeFade<HTMLDivElement>()

  return (
    <div ref={ref} className={styles.chipRow} style={{ WebkitMaskImage: maskImage, maskImage }}>
      {FILTER_OPTIONS.map((option) => {
        const isSelected = selected.has(option.value)
        return (
          <button
            key={option.value}
            type="button"
            className={isSelected ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            onClick={() => onToggle(option.value)}
            aria-pressed={isSelected}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
