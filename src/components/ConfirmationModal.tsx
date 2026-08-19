import styles from './Modal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 54.25 54.25" fill="none" aria-hidden="true" className={styles.headerIcon}>
      <path
        d="M27.125 0C21.7602 0 16.5159 1.59085 12.0552 4.57139C7.59449 7.55192 4.11781 11.7883 2.06478 16.7447C0.0117528 21.7012 -0.525413 27.1551 0.521211 32.4168C1.56784 37.6786 4.15124 42.5118 7.94474 46.3053C11.7382 50.0988 16.5715 52.6822 21.8332 53.7288C27.0949 54.7754 32.5489 54.2383 37.5053 52.1852C42.4617 50.1322 46.6981 46.6555 49.6786 42.1948C52.6592 37.7342 54.25 32.4898 54.25 27.125C54.25 19.931 51.3922 13.0317 46.3053 7.94473C41.2184 2.8578 34.319 0 27.125 0V0ZM50.375 25.1875H38.75C38.5238 18.0519 36.6752 11.0615 33.3444 4.74687C37.9335 6.00218 42.027 8.63513 45.0725 12.2904C48.1179 15.9456 49.9687 20.4472 50.375 25.1875V25.1875ZM27.125 50.375C26.6928 50.404 26.2591 50.404 25.8269 50.375C21.8129 43.9739 19.5853 36.6151 19.375 29.0625H34.875C34.6823 36.6097 32.4748 43.968 28.4813 50.375C28.0297 50.4067 27.5765 50.4067 27.125 50.375ZM19.375 25.1875C19.5678 17.6403 21.7753 10.282 25.7688 3.875C26.6315 3.77806 27.5023 3.77806 28.365 3.875C32.3994 10.2703 34.6473 17.6294 34.875 25.1875H19.375ZM20.8475 4.74687C17.5369 11.0663 15.7082 18.0564 15.5 25.1875H3.87501C4.28131 20.4472 6.13209 15.9456 9.17755 12.2904C12.223 8.63513 16.3165 6.00218 20.9056 4.74687H20.8475ZM3.97189 29.0625H15.5969C15.7991 36.192 17.6211 43.1821 20.925 49.5031C16.3503 48.2343 12.2736 45.5955 9.24296 41.9414C6.21228 38.2873 4.37284 33.7929 3.97189 29.0625V29.0625ZM33.3444 49.5031C36.6752 43.1885 38.5238 36.1981 38.75 29.0625H50.375C49.9687 33.8028 48.1179 38.3044 45.0725 41.9596C42.027 45.6149 37.9335 48.2478 33.3444 49.5031Z"
        fill="var(--black)"
      />
    </svg>
  )
}

function CheckmarkIcon() {
  return (
    <svg viewBox="0 0 22.5 15.3881" fill="none" aria-hidden="true" className={styles.buttonIcon}>
      <path
        d="M8.4375 15.3881L0 6.95062L1.32563 5.625L8.4375 12.7359L21.1744 0L22.5 1.32562L8.4375 15.3881Z"
        fill="white"
      />
    </svg>
  )
}

export default function ConfirmationModal({ isOpen, onClose, onConfirm }: Props) {
  if (!isOpen) return null

  return (
    <div className={`${styles.overlay} ${styles.overlayWelcome}`} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.headerRow}>
          <GlobeIcon />
          <h2 className={styles.heading}>Welcome</h2>
        </div>

        <div className={styles.bodyGroup}>
          <p className={styles.body}>
            This application is intended solely for the use of current University of
            Washington undergraduate students.
          </p>
          <p className={styles.body}>
            You will be redirected to sign in with Google. Please select your UW Google
            account to proceed.
          </p>
        </div>

        <button className={styles.button} onClick={onConfirm}>
          <CheckmarkIcon />
          Sounds good
        </button>
      </div>
    </div>
  )
}
