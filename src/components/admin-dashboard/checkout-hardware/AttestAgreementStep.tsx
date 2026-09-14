import { useState } from 'react'

interface AttestAgreementStepProps {
  agreementUrl: string
  itemName: string
  managerName: string
  isFinalizing: boolean
  onApprove: () => void
  onCancel: () => void
}

export function AttestAgreementStep({
  agreementUrl,
  itemName,
  managerName,
  isFinalizing,
  onApprove,
  onCancel,
}: AttestAgreementStepProps) {
  const [isAttested, setAttested] = useState(false)

  return (
    <div className="checkout-flow__attest-body">
      <h2 className="checkout-flow__attest-title">Verify signed agreement</h2>
      <p className="checkout-flow__attest-copy">
        Review the signed agreement for <strong>{itemName}</strong> before completing checkout.
      </p>
      <div className="checkout-flow__pdf-frame">
        <iframe title={`Signed agreement for ${itemName}`} src={agreementUrl} />
      </div>
      <a className="checkout-flow__pdf-link" href={agreementUrl} target="_blank" rel="noopener noreferrer">
        Open agreement in a new tab
      </a>
      <label className="checkout-flow__attest-check">
        <input
          type="checkbox"
          checked={isAttested}
          disabled={isFinalizing}
          onChange={(event) => setAttested(event.target.checked)}
        />
        <span>
          I confirm that I reviewed the signed agreement and approve this checkout as {managerName}.
        </span>
      </label>
      <button
        type="button"
        className="checkout-flow__primary-button"
        onClick={onApprove}
        disabled={!isAttested || isFinalizing}
      >
        {isFinalizing ? 'Finalizing…' : 'Approve and check out'}
      </button>
      <button type="button" className="checkout-flow__secondary-button" onClick={onCancel} disabled={isFinalizing}>
        Cancel
      </button>
    </div>
  )
}
