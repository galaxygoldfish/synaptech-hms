import brainLogo from '../../../assets/synaptech-brain.png'
import qrItemDocs from '../../../assets/qr-item-docs.png'
import qrCheckoutPolicy from '../../../assets/qr-checkout-policy.png'
import styles from './QrDocLabel.module.css'

interface QrDocLabelProps {
  productName: string
}

// Print label 1 of 2: product name + QR codes for item docs and the
// hardware checkout & usage policy. The QR codes are the same for every
// unit of a given product, so only the name varies between items.
export function QrDocLabel({ productName }: QrDocLabelProps) {
  return (
    <div className={styles.label}>
      <div className={styles.header}>
        <img src={brainLogo} alt="" className={styles.brainLogo} />
        <span className={styles.wordmark}>Synaptech</span>
      </div>

      <p className={styles.productName}>{productName}</p>

      <div className={`${styles.panel} ${styles.panelDocs}`}>
        <img src={qrItemDocs} alt="" className={styles.qrCode} />
        <p className={styles.panelText}>Scan for item-specific documentation</p>
      </div>

      <div className={`${styles.panel} ${styles.panelPolicy}`}>
        <img src={qrCheckoutPolicy} alt="" className={styles.qrCode} />
        <p className={styles.panelText}>Synaptech Hardware Checkout &amp; Usage Policy</p>
      </div>
    </div>
  )
}
