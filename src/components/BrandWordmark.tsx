import brainLogo from '../assets/synaptech-brain.png'
import styles from './BrandWordmark.module.css'

interface BrandWordmarkProps {
  hideHardwareOnMobile?: boolean
  mutedText?: string
  compact?: boolean
  onClick?: () => void
}

export function BrandWordmark({ hideHardwareOnMobile, mutedText = 'Hardware', compact, onClick }: BrandWordmarkProps) {
  const content = (
    <>
      <img
        src={brainLogo}
        alt=""
        className={compact ? `${styles.brainLogo} ${styles.brainLogoCompact}` : styles.brainLogo}
      />
      <span className={compact ? `${styles.logoText} ${styles.logoTextCompact}` : styles.logoText}>
        <span className={styles.logoTextBrand}>Synaptech</span>
        <span
          className={
            hideHardwareOnMobile
              ? `${styles.logoTextMuted} ${styles.logoTextMutedHideMobile}`
              : styles.logoTextMuted
          }
        >
          {mutedText}
        </span>
      </span>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={`${styles.brand} ${styles.brandButton}`} onClick={onClick} aria-label="Go to home">
        {content}
      </button>
    )
  }

  return <div className={styles.brand}>{content}</div>
}
