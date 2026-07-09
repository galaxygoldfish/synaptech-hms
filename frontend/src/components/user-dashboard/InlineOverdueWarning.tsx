import { WarningIcon } from "./icons";

interface InlineOverdueWarningProps {
  onDismiss: () => void;
}

export function InlineOverdueWarning({ onDismiss }: InlineOverdueWarningProps) {
  return (
    <div className="inline-warning" onClick={onDismiss}>
      <span className="inline-warning__icon">
        <WarningIcon />
      </span>
      <p>You must return all overdue hardware before you can check out more</p>
    </div>
  );
}
