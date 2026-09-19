import type { RefObject } from 'react'
import { ChevronRightIcon, ScanIconFilled, ServerIconFilled } from '../icons'
import styles from './HardwareFlow.module.css'

/**
 * The viewfinder and the two ways past it, shared by the checkout and return
 * flows. Both screens ask the same question of a barcode — which loan is
 * this unit on — and only differ in what counts as an answer, so the asking
 * lives here and the answering stays with each flow.
 */

/** What the viewfinder shows over the camera after reading a barcode. */
export type ScanFeedback = {
  /**
   * 'warning' is for a barcode that was read and belongs to us but is the
   * wrong one — a different thing from a label this app has never seen,
   * which is 'failure'.
   */
  kind: 'success' | 'warning' | 'failure'
  message: string
}

const MARKER_CLASS: Record<ScanFeedback['kind'], string> = {
  success: styles.scanMarkerSuccess,
  warning: styles.scanMarkerWarning,
  failure: styles.scanMarkerFailure,
}

function MarkerGlyph({ kind }: { kind: ScanFeedback['kind'] }) {
  if (kind === 'success') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M13 25.5 20.5 33 35 16" />
      </svg>
    )
  }
  if (kind === 'warning') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M24 13v18" />
        <path d="M24 37.5v.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
      <path d="M16 16l16 16" />
      <path d="M32 16l-16 16" />
    </svg>
  )
}

interface ScanColumnProps {
  videoRef: RefObject<HTMLVideoElement | null>
  isSupported: boolean
  permissionError: string | null
  feedback: ScanFeedback | null
  /** The line under the frame saying what to point the camera at. */
  caption: string
  /** Label for the row that opens the list — the flows list different loans. */
  pickLabel: string
  onEnterSerial: () => void
  onPickFromDatabase: () => void
}

export function ScanColumn({
  videoRef,
  isSupported,
  permissionError,
  feedback,
  caption,
  pickLabel,
  onEnterSerial,
  onPickFromDatabase,
}: ScanColumnProps) {
  return (
    <div className={styles.scanColumn}>
      <div className={styles.scanFrame}>
        {isSupported ? (
          <video
            ref={videoRef}
            className={feedback ? `${styles.scanVideo} ${styles.scanVideoBlurred}` : styles.scanVideo}
            muted
            playsInline
          />
        ) : (
          // Only reached if the WebAssembly scanner can't load at all —
          // typing the serial is the whole path then.
          <p className={styles.scanPlaceholder}>
            Barcode scanning isn&rsquo;t available here. Enter the serial number by hand below
            instead.
          </p>
        )}
        {feedback && (
          <div className={styles.scanOverlay} role="status" aria-live="assertive">
            <span className={`${styles.scanMarker} ${MARKER_CLASS[feedback.kind]}`}>
              <MarkerGlyph kind={feedback.kind} />
            </span>
            <span className={styles.scanFeedbackText}>{feedback.message}</span>
          </div>
        )}
      </div>

      {permissionError && <p className={styles.inlineError}>{permissionError}</p>}

      <p className={styles.scanCaption}>{caption}</p>

      {/* The two ways past the camera, as two of the same thing: one for a
          label that won't read, one for hardware that can't be identified
          from the label at all. Grouped, so they read as a pair rather than
          as two more items in the column. */}
      <div className={styles.altActions}>
        <button type="button" className={styles.altButton} onClick={onEnterSerial}>
          <span className={styles.altButtonLabel}>
            <ScanIconFilled size={20} />
            Enter serial number
          </span>
          <ChevronRightIcon size={20} />
        </button>

        <button type="button" className={styles.altButton} onClick={onPickFromDatabase}>
          <span className={styles.altButtonLabel}>
            <ServerIconFilled size={20} />
            {pickLabel}
          </span>
          <ChevronRightIcon size={20} />
        </button>
      </div>
    </div>
  )
}
