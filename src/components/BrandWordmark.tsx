import brainLogo from '../assets/synaptech-brain.png'
import styles from './BrandWordmark.module.css'

const MUTED_FROM_CLASS = {
  tablet: styles.logoTextMutedTabletUp,
  desktop: styles.logoTextMutedDesktopUp,
} as const

interface BrandWordmarkProps {
  /**
   * Width from which the muted half of the wordmark is shown; below it, the
   * wordmark is "Synaptech" alone. Which width a header can afford depends on
   * how long its muted text is — "Hardware Management" needs a desktop, while
   * "Hardware" fits from a tablet up. Omit to always show it.
   */
  mutedFrom?: keyof typeof MUTED_FROM_CLASS
  mutedText?: string
  compact?: boolean
  onClick?: () => void
}

export function BrandWordmark({ mutedFrom, mutedText = 'Hardware', compact, onClick }: BrandWordmarkProps) {
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
            mutedFrom ? `${styles.logoTextMuted} ${MUTED_FROM_CLASS[mutedFrom]}` : styles.logoTextMuted
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
