import { SearchIconFilled } from "./icons";
import styles from "./AdminHome.module.css";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search for an action" }: SearchBarProps) {
  return (
    <div className={styles.searchBar}>
      <SearchIconFilled size={20} className={styles.searchBarIcon} />
      <input
        type="text"
        className={styles.searchBarInput}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}
