import styles from './Modal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

function GlobeIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <circle cx="22" cy="22" r="19" stroke="var(--black)" strokeWidth="2" />
      <ellipse cx="22" cy="22" rx="10" ry="19" stroke="var(--black)" strokeWidth="2" />
      <line x1="3" y1="22" x2="41" y2="22" stroke="var(--black)" strokeWidth="2" />
      <path d="M7 13 Q22 17.5 37 13" stroke="var(--black)" strokeWidth="2" fill="none" />
      <path d="M7 31 Q22 26.5 37 31" stroke="var(--black)" strokeWidth="2" fill="none" />
    </svg>
  )
}

export default function ConfirmationModal({ isOpen, onClose, onConfirm }: Props) {
  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.iconWrap}>
          <GlobeIcon />
        </div>

        <h2 className={styles.heading}>Welcome</h2>

        <p className={styles.body}>
          This application is intended solely for the use of current University of
          Washington undergraduate students.
          <br /><br />
          You will be redirected to sign in with Google. Please select your UW Google
          account to proceed.
        </p>

        <button className={styles.button} onClick={onConfirm}>
          → Sounds good
        </button>
      </div>
    </div>
  )
}
