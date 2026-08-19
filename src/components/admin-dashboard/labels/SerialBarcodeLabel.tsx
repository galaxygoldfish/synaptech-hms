import brainLogo from '../../../assets/synaptech-brain.png'
import styles from './SerialBarcodeLabel.module.css'

interface SerialBarcodeLabelProps {
  serial: string
}

// Print label 2 of 2: barcode + human-readable text, both driven by the
// item's unique serial number.
export function SerialBarcodeLabel({ serial }: SerialBarcodeLabelProps) {
  return (
    <div className={styles.label}>
      <div className={styles.header}>
        <img src={brainLogo} alt="" className={styles.brainLogo} />
        <span className={styles.wordmark}>Synaptech</span>
      </div>

      <p className={styles.barcode}>{serial}</p>
      <p className={styles.serialText}>{serial}</p>
    </div>
  )
}
