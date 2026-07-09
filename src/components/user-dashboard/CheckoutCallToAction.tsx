import { PlusIcon } from "./icons";

interface CheckoutCallToActionProps {
  disabled: boolean;
  onClick: () => void;
}

export function CheckoutCallToAction({ disabled, onClick }: CheckoutCallToActionProps) {
  return (
    <button
      className={`checkout-cta${disabled ? " checkout-cta--disabled" : ""}`}
      type="button"
      onClick={onClick}
      aria-disabled={disabled}
    >
      <span className="checkout-cta__icon">
        <PlusIcon />
      </span>
      <span className="checkout-cta__title">Check out hardware</span>
      <span className="checkout-cta__subtitle">Start a new request to check out new or used hardware</span>
    </button>
  );
}
