import type { UserProfile } from "../../types";
import { CloseIcon, HandleIcon, MailIcon, PersonIcon, PinIcon } from "./icons";

interface ProfileModalProps {
  user: UserProfile;
  onClose: () => void;
  onLogOut: () => void;
}

export function ProfileModal({ user, onClose, onLogOut }: ProfileModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
        <button className="profile-modal__close" onClick={onClose} type="button" aria-label="Close profile">
          <CloseIcon />
        </button>

        <div className="profile-modal__identity">
          <span className="profile-modal__avatar">
            <PersonIcon size={26} />
          </span>
          <div>
            <div className="profile-modal__name">{user.name}</div>
            <span className="profile-modal__badge">{user.role}</span>
          </div>
        </div>

        <ul className="profile-modal__details">
          <li>
            <MailIcon />
            <span>{user.email}</span>
          </li>
          <li>
            <HandleIcon />
            <span>{user.handle}</span>
          </li>
          <li>
            <PinIcon />
            <span>{user.location}</span>
          </li>
        </ul>

        <button className="profile-modal__logout" onClick={onLogOut} type="button">
          Log out
        </button>
      </div>
    </div>
  );
}
