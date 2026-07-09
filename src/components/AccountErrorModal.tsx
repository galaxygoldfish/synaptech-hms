import styles from './Modal.module.css'

interface Props {
  isOpen: boolean
  onRetry: () => void
}

function WarningIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path
        d="M22 5L41 38H3L22 5Z"
        fill="#FEE2E2"
        stroke="#dc2626"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line x1="22" y1="18" x2="22" y2="28" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="22" cy="33" r="1.75" fill="#dc2626" />
    </svg>
  )
}

export default function AccountErrorModal({ isOpen, onRetry }: Props) {
  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.iconWrap}>
          <WarningIcon />
        </div>

        <h2 className={`${styles.heading} ${styles.headingError}`}>Account Error</h2>

        <p className={styles.body}>
          You must use your UW Google account to sign in. Personal accounts are not
          accepted.
          <br /><br />
          Please try again by selecting only your UW Google account to sign in.
        </p>

        <button className={styles.button} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  )
}
