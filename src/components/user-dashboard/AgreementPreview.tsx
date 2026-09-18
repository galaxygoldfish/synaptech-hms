import {
  AGREEMENT_INTRO_PARAGRAPHS,
  AGREEMENT_SIGNATURE_DISCLAIMER,
  AGREEMENT_STATIC_SECTIONS,
  AGREEMENT_TITLE,
  type AgreementBlock,
} from '../../lib/loanAgreementContent'
import styles from './AgreementPreview.module.css'

interface AgreementPreviewProps {
  fullName: string
  studentId: string
  studentEmail: string
  phone: string
  address: string
  productName: string
  serialNumber: string
  loanDate: string
  returnDate: string
  replacementValue: string
  signatureName: string
  signatureDate: string
  onSignatureNameChange: (value: string) => void
  onSignatureDateChange: (value: string) => void
}

function KeyValueList({ rows, muted }: { rows: [string, string][]; muted?: boolean }) {
  return (
    <dl className={muted ? `${styles.kv} ${styles.kvMuted}` : styles.kv}>
      {rows.map(([label, value]) => (
        <div className={styles.kvRow} key={label}>
          <dt className={styles.kvLabel}>{label}</dt>
          <dd className={styles.kvValue}>{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function Block({ block }: { block: AgreementBlock }) {
  if (block.type === 'paragraph') return <p className={styles.paragraph}>{block.text}</p>

  if (block.type === 'list') {
    return (
      <ol className={styles.list}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    )
  }

  const ratios = block.columnRatios ?? block.header.map(() => 1)
  const ratioTotal = ratios.reduce((sum, ratio) => sum + ratio, 0)

  return (
    <table className={styles.table}>
      <colgroup>
        {ratios.map((ratio, index) => (
          <col key={index} style={{ width: `${(ratio / ratioTotal) * 100}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {block.header.map((cell) => (
            <th key={cell}>{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function AgreementPreview({
  fullName,
  studentId,
  studentEmail,
  phone,
  address,
  productName,
  serialNumber,
  loanDate,
  returnDate,
  replacementValue,
  signatureName,
  signatureDate,
  onSignatureNameChange,
  onSignatureDateChange,
}: AgreementPreviewProps) {
  return (
    <div className={styles.preview}>
      <h2 className={styles.title}>{AGREEMENT_TITLE}</h2>
      {AGREEMENT_INTRO_PARAGRAPHS.map((paragraph) => (
        <p className={styles.paragraph} key={paragraph}>
          {paragraph}
        </p>
      ))}

      <h3 className={styles.sectionHeading}>1. Borrower information</h3>
      <KeyValueList
        rows={[
          ['Full Name', fullName],
          ['UW Student ID Number', studentId],
          ['UW Student Email', studentEmail],
          ['Phone Number', phone],
          ['Address', address],
        ]}
      />

      <h3 className={styles.sectionHeading}>2. Hardware checked out</h3>
      <KeyValueList
        rows={[
          ['Hardware product', productName],
          ['Hardware product serial number', serialNumber],
          ['Loan date', loanDate],
          ['Return date', returnDate],
          ['Hardware product replacement value', replacementValue],
        ]}
      />

      {AGREEMENT_STATIC_SECTIONS.map((section) => (
        <section key={section.heading}>
          <h3 className={styles.sectionHeading}>{section.heading}</h3>
          {section.blocks.map((block, index) => (
            <Block block={block} key={index} />
          ))}
        </section>
      ))}

      <h3 className={styles.sectionHeading}>9. Electronic signature</h3>
      <p className={styles.paragraph}>{AGREEMENT_SIGNATURE_DISCLAIMER}</p>

      <div className={styles.signatureRow}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Borrower signature — type your full legal name</span>
          <input
            type="text"
            className={styles.fieldInput}
            value={signatureName}
            onChange={(event) => onSignatureNameChange(event.target.value)}
            placeholder="Your full legal name"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Date of signature</span>
          <input
            type="date"
            className={styles.fieldInput}
            value={signatureDate}
            onChange={(event) => onSignatureDateChange(event.target.value)}
          />
        </label>
      </div>

      <h3 className={styles.sectionHeading}>10. For internal use</h3>
      <p className={styles.internalNote}>Left blank — completed by Synaptech RSO Hardware Managers</p>
      <KeyValueList
        muted
        rows={[
          ['Received date', ''],
          ['Received time', ''],
          ['Receiving Hardware Manager name', ''],
        ]}
      />
    </div>
  )
}
