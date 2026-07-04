import { SearchIcon } from "./icons";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="search-bar">
      <SearchIcon />
      <input
        type="text"
        placeholder="Search for an action"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search for an action"
      />
    </div>
  );
}
