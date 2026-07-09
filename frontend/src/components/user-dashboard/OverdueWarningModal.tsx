import { WarningIcon } from "./icons";

interface OverdueWarningModalProps {
  onClose: () => void;
}

export function OverdueWarningModal({ onClose }: OverdueWarningModalProps) {
  return (
    <div className="modal-overlay warning-overlay" onClick={onClose}>
      <div className="warning-modal" onClick={(event) => event.stopPropagation()}>
        <span className="warning-modal__icon">
          <WarningIcon />
        </span>
        <p>You must return all overdue hardware before you can check out more.</p>
        <button className="warning-modal__ok" onClick={onClose} type="button">
          OK
        </button>
      </div>
    </div>
  );
}
