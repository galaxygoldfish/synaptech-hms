import brainLogo from '../../../assets/synaptech-brain.png'
import { encodeCode128B } from '../../../lib/code128'
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

      {/* The barcode line carries the Code 128 framing the font doesn't add
          for itself; the line below it stays the plain serial a person
          reads. Printing the raw serial into the font produced a barcode
          no scanner could decode. */}
      <p className={styles.barcode}>{encodeCode128B(serial)}</p>
      <p className={styles.serialText}>{serial}</p>
    </div>
  )
}
