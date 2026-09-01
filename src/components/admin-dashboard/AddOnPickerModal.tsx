import { useMemo, useState } from 'react'
import type { Equipment } from '../../types'
import { ChevronRightFilled, CloseIcon, SearchIcon } from './icons'
import styles from './AddOnPickerModal.module.css'

interface AddOnPickerModalProps {
  options: Equipment[]
  isLoading?: boolean
  error?: string | null
  onSelect: (equipment: Equipment) => void
  onClose: () => void
}

export function AddOnPickerModal({ options, isLoading, error, onSelect, onClose }: AddOnPickerModalProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter(
      (item) =>
        item.name.toLowerCase().includes(term) || (item.description ?? '').toLowerCase().includes(term),
    )
  }, [options, query])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.heading}>Select an add-on product</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles.searchField}>
          <SearchIcon size={20} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search our hardware inventory"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.list}>
          {isLoading && <p className={styles.status}>Loading inventory…</p>}
          {!isLoading && error && <p className={styles.status}>{error}</p>}
          {!isLoading && !error && filtered.length === 0 && (
            <p className={styles.status}>No matching products found.</p>
          )}
          {!isLoading &&
            !error &&
            filtered.map((item) => (
              <button key={item.id} type="button" className={styles.item} onClick={() => onSelect(item)}>
                {item.image_url && <img src={item.image_url} alt="" className={styles.itemThumb} />}
                <span className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.description && <span className={styles.itemDescription}>{item.description}</span>}
                  <span className={styles.itemAvailable}>{item.quantity_total} available</span>
                </span>
                <ChevronRightFilled size={9} color="rgba(0, 0, 0, 0.4)" className={styles.itemChevron} />
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
