import styles from './Modal.module.css'

interface Props {
  isOpen: boolean
  onRetry: () => void
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 57.1875 49.5625" fill="none" aria-hidden="true" className={styles.headerIcon}>
      <path
        d="M41.9375 2.75732e-09C42.2706 -1.26536e-05 42.5979 0.0871159 42.8867 0.25293C43.1755 0.418792 43.4161 0.657687 43.584 0.945313L56.9277 23.8203C57.0978 24.1119 57.1875 24.4437 57.1875 24.7813C57.1875 25.1188 57.0978 25.4506 56.9277 25.7422L43.584 48.6172C43.4161 48.9048 43.1755 49.1437 42.8867 49.3096C42.5979 49.4754 42.2706 49.5625 41.9375 49.5625H15.25C14.9169 49.5625 14.5896 49.4754 14.3008 49.3096C14.012 49.1437 13.7714 48.9048 13.6035 48.6172L0.259766 25.7422C0.0896832 25.4506 0 25.1188 0 24.7813C0 24.4437 0.0896832 24.1119 0.259766 23.8203L13.6035 0.945313C13.7714 0.65768 14.012 0.418795 14.3008 0.25293C14.5896 0.0871084 14.9169 -9.32224e-06 15.25 2.75732e-09H41.9375ZM4.11328 24.7813L16.3447 45.75H40.8428L53.0742 24.7813L40.8428 3.8125H16.3447L4.11328 24.7813ZM28.5938 34.3125C29.3521 34.3125 30.079 34.6142 30.6152 35.1504C31.1515 35.6866 31.4531 36.4135 31.4531 37.1719C31.4531 37.7374 31.2859 38.2905 30.9717 38.7607C30.6576 39.2308 30.2108 39.597 29.6885 39.8135C29.1661 40.0299 28.5907 40.0868 28.0361 39.9766C27.4815 39.8662 26.9722 39.5933 26.5723 39.1934C26.1724 38.7935 25.8994 38.2842 25.7891 37.7295C25.6788 37.175 25.7359 36.6004 25.9521 36.0781C26.1686 35.5556 26.5347 35.1081 27.0049 34.7939C27.4751 34.4798 28.0282 34.3125 28.5938 34.3125ZM30.5 28.5938H26.6875V9.53125H30.5V28.5938Z"
        fill="#B80000"
      />
    </svg>
  )
}

export default function AccountErrorModal({ isOpen, onRetry }: Props) {
  if (!isOpen) return null

  return (
    <div className={`${styles.overlay} ${styles.overlayError}`}>
      <div className={styles.modal}>
        <div className={styles.headerRow}>
          <WarningIcon />
          <h2 className={`${styles.heading} ${styles.headingError}`}>Account error</h2>
        </div>

        <div className={styles.bodyGroup}>
          <p className={styles.body}>
            You must use your UW Google account to sign in.
            <br />
            Personal accounts are not accepted.
          </p>
          <p className={styles.body}>
            Please try again by selecting only your UW Google account to sign in.
          </p>
        </div>

        <button className={styles.button} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  )
}
