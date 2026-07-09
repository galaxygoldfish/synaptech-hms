import { BrainLogoIcon, PersonIcon } from "./icons";

interface HeaderProps {
  userName: string;
  onProfileClick: () => void;
}

export function Header({ userName, onProfileClick }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <BrainLogoIcon />
        <h1>
          <span className="app-header__brand-strong">Synaptech</span>{" "}
          <span className="app-header__brand-muted">Hardware</span>
        </h1>
      </div>
      <div className="app-header__actions">
        <button className="pill-button" onClick={onProfileClick} type="button">
          <PersonIcon />
          <span>{userName}</span>
        </button>
      </div>
    </header>
  );
}
