import brainLogo from '../../assets/synaptech-brain.png'
import {
  AGREEMENT_INTRO_PARAGRAPHS,
  AGREEMENT_SIGNATURE_DISCLAIMER,
  AGREEMENT_STATIC_SECTIONS,
  AGREEMENT_TITLE,
  type AgreementBlock,
} from '../../lib/loanAgreementContent'
import styles from './AgreementPreview.module.css'

/** The three fields section 10 reserves for the Hardware Managers. */
export interface AgreementInternalUse {
  receivedDate: string
  receivedTime: string
  managerName: string
  onReceivedDateChange: (value: string) => void
  onReceivedTimeChange: (value: string) => void
  onManagerNameChange: (value: string) => void
}

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
  /**
   * 'sign' — the borrower fills in section 9 and section 10 stays blank for
   * the Club. 'review' — the borrower already signed, so section 9 is a
   * statement of that rather than a pair of inputs, and section 10 is the
   * part that's editable. Both render the identical agreement either way,
   * which is the point of this component existing at all.
   */
  mode?: 'sign' | 'review'
  signatureName?: string
  signatureDate?: string
  onSignatureNameChange?: (value: string) => void
  onSignatureDateChange?: (value: string) => void
  /** Makes section 10 editable. Omit to leave it blank, as the borrower sees it. */
  internalUse?: AgreementInternalUse
}

function KeyValueList({
  rows,
  muted,
  wideLabel,
}: {
  rows: [string, string][]
  muted?: boolean
  /** Sections 2 and 10 give the label column 3.1in instead of 2.1in. */
  wideLabel?: boolean
}) {
  const className = [styles.kv, muted ? styles.kvMuted : '', wideLabel ? styles.kvWideLabel : '']
    .filter(Boolean)
    .join(' ')
  return (
    <dl className={className}>
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
  if (block.type === 'paragraph') {
    return (
      <p
        className={styles.paragraph}
        style={block.gapAfter === undefined ? undefined : { marginBottom: `calc(${block.gapAfter} * var(--in))` }}
      >
        {block.text}
      </p>
    )
  }

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
  mode = 'sign',
  signatureName = '',
  signatureDate = '',
  onSignatureNameChange,
  onSignatureDateChange,
  internalUse,
}: AgreementPreviewProps) {
  return (
    <div className={styles.preview}>
      <div className={styles.sheet}>
      {/* The PDF draws this at the top of every page; a continuous scroll
          has one page, so it appears once. */}
      <div className={styles.docHeader}>
        <img src={brainLogo} alt="" className={styles.docLogo} />
        <span className={styles.docWordmark}>SYNAPTECH</span>
      </div>

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
        wideLabel
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

      {mode === 'review' ? (
        // The same two-column table the PDF prints the signature in, read
        // back rather than offered as inputs — there is nothing here to
        // interact with, and a form control that can't be used only invites
        // the attempt.
        <table className={`${styles.table} ${styles.signatureTable}`}>
          <thead>
            <tr>
              <th>Borrower electronic signature</th>
              <th>Date of signature</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{signatureName || 'Not recorded'}</td>
              <td>{signatureDate || 'Not recorded'}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className={styles.signatureRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Borrower signature — type your full legal name</span>
            <input
              type="text"
              className={styles.fieldInput}
              value={signatureName}
              onChange={(event) => onSignatureNameChange?.(event.target.value)}
              placeholder="Your full legal name"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date of signature</span>
            <input
              type="date"
              className={styles.fieldInput}
              value={signatureDate}
              onChange={(event) => onSignatureDateChange?.(event.target.value)}
            />
          </label>
        </div>
      )}

      <h3 className={styles.sectionHeading}>10. For internal use</h3>
      {internalUse ? (
        <>
          <p className={styles.internalNote}>For Synaptech RSO Hardware Managers</p>
          <div className={styles.signatureRow}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Received date</span>
              <input
                type="date"
                className={styles.fieldInput}
                value={internalUse.receivedDate}
                onChange={(event) => internalUse.onReceivedDateChange(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Received time</span>
              <input
                type="time"
                className={styles.fieldInput}
                value={internalUse.receivedTime}
                onChange={(event) => internalUse.onReceivedTimeChange(event.target.value)}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Receiving Hardware Manager name</span>
            <input
              type="text"
              className={styles.fieldInput}
              value={internalUse.managerName}
              onChange={(event) => internalUse.onManagerNameChange(event.target.value)}
              placeholder="Your full legal name"
            />
          </label>
        </>
      ) : (
        <>
          <p className={styles.internalNote}>For Synaptech RSO Hardware Managers</p>
          <KeyValueList
            muted
            wideLabel
            rows={[
              ['Received date', ''],
              ['Received time', ''],
              ['Receiving Hardware Manager name', ''],
            ]}
          />
        </>
      )}
      </div>
    </div>
  )
}
