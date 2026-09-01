import { SearchIcon } from './icons'
import styles from './SearchField.module.css'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchField({ value, onChange, placeholder = 'Search our inventory', className }: SearchFieldProps) {
  return (
    <div className={className ? `${styles.searchField} ${className}` : styles.searchField}>
      <SearchIcon size={20} className={styles.searchIcon} />
      <input
        type="text"
        className={styles.searchInput}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
      />
    </div>
  )
}
