import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import ConfirmActionModal from '../ConfirmActionModal'
import { ArrowLeftIcon, CheckmarkIconFilled } from './icons'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import { normalizeSerialNumber, SERIAL_PREFIX } from '../../lib/serialNumber'
import {
  fetchAuditableInventory,
  recordInventoryAudit,
  type AuditableUnit,
  type InventoryAuditStatus,
  type RecordInventoryAuditEntry,
} from '../../lib/inventoryAudit'
import { STATUS_LABEL, UnitRow } from './InventoryAuditParts'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './InventoryAudit.module.css'

/**
 * A live inventory audit: point the camera at whatever is on the shelf, in
 * any order, and watch the "still missing" list empty out.
 *
 * Everything is held in this component until the auditor presses Finish.
 * Nothing partial is written, for two reasons: an audit is only meaningful
 * as a complete statement about a moment ("this is what was on the shelf"),
 * and a half-saved one left behind by a phone going to sleep mid-shelf would
 * be indistinguishable from a real finding of mass disappearance.
 *
 * The barcode plumbing is the same useBarcodeScanner the hand-off, checkout
 * and return flows use — this screen differs only in never stopping: every
 * read bumps `scanAttempt` to restart the loop, because an audit is dozens of
 * scans in a row rather than one verification.
 */

// Long enough to read the result, short enough to keep a rhythm going when
// someone is working down a shelf. Shorter than the hand-off's holds, which
// gate a decision rather than punctuating a repetitive task.
const SCAN_HOLD_MS = 800
const PROBLEM_HOLD_MS = 1600

/** What the viewfinder shows over the camera after reading a barcode. */
type ScanFeedback = {
  kind: 'confirmed' | 'repeat' | 'found_checked_out' | 'unrecognized'
  message: string
}

const MARKER_CLASS: Record<ScanFeedback['kind'], string> = {
  confirmed: styles.scanMarkerSuccess,
  repeat: styles.scanMarkerRepeat,
  found_checked_out: styles.scanMarkerWarning,
  unrecognized: styles.scanMarkerFailure,
}

function MarkerGlyph({ kind }: { kind: ScanFeedback['kind'] }) {
  if (kind === 'confirmed') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M13 25.5 20.5 33 35 16" />
      </svg>
    )
  }
  if (kind === 'unrecognized') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M16 16l16 16" />
        <path d="M32 16l-16 16" />
      </svg>
    )
  }
  if (kind === 'found_checked_out') {
    return (
      <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
        <path d="M24 13v18" />
        <path d="M24 37.5v.5" />
      </svg>
    )
  }
  // A repeat scan: the same tick, but on a neutral plate — nothing was wrong,
  // and nothing changed either.
  return (
    <svg viewBox="0 0 48 48" className={styles.scanMarkerGlyph} aria-hidden="true">
      <path d="M13 25.5 20.5 33 35 16" />
    </svg>
  )
}

/** Which list the auditor is looking at while they work. */
type ScanFilter = 'missing' | 'confirmed' | 'checked_out' | 'discrepancies'

const FILTERS: { value: ScanFilter; label: string }[] = [
  // Missing first, and selected by default: it's the list you walk the shelf
  // against, and it's the only one that gets shorter as you work.
  { value: 'missing', label: 'Missing' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'discrepancies', label: 'Flagged' },
]

interface ScannedBarcode {
  /** Normalised serial, as stored. */
  serial: string
  /** ISO timestamp of the read. */
  at: string
}

/**
 * The four outcomes a unit that IS in inventory can have. 'unrecognized'
 * belongs to a barcode, not a unit, so it's excluded here rather than left as
 * a case every count and list has to remember is impossible.
 */
type UnitOutcome = Exclude<InventoryAuditStatus, 'unrecognized'>

/**
 * A unit plus what the audit currently says about it. Recomputed from the
 * inventory snapshot and the set of scans rather than stored, so a unit can
 * never end up in two lists at once.
 */
interface ClassifiedUnit {
  unit: AuditableUnit
  status: UnitOutcome
  scannedAt: string | null
}

export default function InventoryAuditScan() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [units, setUnits] = useState<AuditableUnit[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keyed by normalised serial, so scanning the same label twice is a repeat
  // rather than a second entry.
  const [scans, setScans] = useState<Map<string, ScannedBarcode>>(new Map())
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null)
  // Bumped after every read to restart the camera loop, which stops at the
  // first barcode it sees.
  const [scanAttempt, setScanAttempt] = useState(0)
  const [filter, setFilter] = useState<ScanFilter>('missing')
  const [manualSerial, setManualSerial] = useState('')
  const [note, setNote] = useState('')

  const [isFinishOpen, setFinishOpen] = useState(false)
  const [isSaving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    fetchAuditableInventory()
      .then((rows) => {
        if (!cancelled) setUnits(rows)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventory for the audit:', fetchError)
        if (!cancelled) setError('Could not load the inventory to audit. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null
    return {
      name: `${profile.first_name} ${profile.last_name}`,
      role: profile.role === 'admin' ? 'ADMINISTRATOR' : 'MEMBER',
      email: profile.uw_email,
      handle: profile.discord,
      location: profile.address,
    }
  }, [profile])

  const unitBySerial = useMemo(
    () => new Map(units.map((unit) => [normalizeSerialNumber(unit.serialNumber), unit])),
    [units],
  )

  const classified = useMemo<ClassifiedUnit[]>(
    () =>
      units.map((unit) => {
        const scan = scans.get(normalizeSerialNumber(unit.serialNumber))
        const status: UnitOutcome =
          unit.expectation === 'checked_out'
            ? scan
              ? 'found_checked_out'
              : 'checked_out'
            : scan
              ? 'confirmed'
              : 'missing'
        return { unit, status, scannedAt: scan?.at ?? null }
      }),
    [units, scans],
  )

  /** Scanned barcodes matching no unit in inventory, newest read first. */
  const unrecognized = useMemo(
    () =>
      [...scans.values()]
        .filter((scan) => !unitBySerial.has(scan.serial))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [scans, unitBySerial],
  )

  const counts = useMemo(() => {
    const byStatus: Record<UnitOutcome, number> = {
      confirmed: 0,
      missing: 0,
      checked_out: 0,
      found_checked_out: 0,
    }
    for (const { status } of classified) byStatus[status] += 1
    return {
      ...byStatus,
      unrecognized: unrecognized.length,
      expected: byStatus.confirmed + byStatus.missing,
      discrepancies: byStatus.found_checked_out + unrecognized.length,
    }
  }, [classified, unrecognized])

  const filterCounts: Record<ScanFilter, number> = {
    missing: counts.missing,
    confirmed: counts.confirmed,
    checked_out: counts.checked_out,
    discrepancies: counts.discrepancies,
  }

  const visibleUnits = useMemo(() => {
    if (filter === 'discrepancies') return classified.filter((row) => row.status === 'found_checked_out')
    if (filter === 'missing') return classified.filter((row) => row.status === 'missing')
    if (filter === 'confirmed') {
      // Most recently scanned first: while scanning, the interesting end of
      // the confirmed list is the last thing you put down.
      return classified
        .filter((row) => row.status === 'confirmed')
        .sort((a, b) => (b.scannedAt ?? '').localeCompare(a.scannedAt ?? ''))
    }
    return classified.filter((row) => row.status === 'checked_out')
  }, [classified, filter])

  /**
   * Records one barcode, however it arrived, and puts the result on screen.
   * `units` is read through the closure, so this is rebuilt whenever the
   * inventory snapshot changes — the scanner hook keeps the latest version in
   * a ref, so the camera loop always calls the current one.
   */
  const registerBarcode = useCallback(
    (rawValue: string) => {
      const serial = normalizeSerialNumber(rawValue)
      if (!serial || serial === SERIAL_PREFIX) return

      const known = unitBySerial.get(serial)
      const alreadyScanned = scans.has(serial)
      const at = new Date().toISOString()

      if (!alreadyScanned) {
        setScans((current) => new Map(current).set(serial, { serial, at }))
      }

      if (alreadyScanned) {
        setFeedback({
          kind: 'repeat',
          message: `Already counted — ${known ? known.equipmentName : serial}`,
        })
      } else if (!known) {
        setFeedback({ kind: 'unrecognized', message: `${serial} is not recognised in inventory` })
      } else if (known.expectation === 'checked_out') {
        setFeedback({
          kind: 'found_checked_out',
          message: known.memberName
            ? `${known.equipmentName} is on the shelf but marked out with ${known.memberName}`
            : `${known.equipmentName} is on the shelf but marked out on loan`,
        })
      } else {
        setFeedback({ kind: 'confirmed', message: `${known.equipmentName} counted — ${serial}` })
      }

      // The camera loop stopped when it read this barcode. Clearing the
      // result and restarting it are the same beat: an audit is one scan
      // after another, so the viewfinder goes straight back to live.
      const hold = !alreadyScanned && known && known.expectation === 'in_stock' ? SCAN_HOLD_MS : PROBLEM_HOLD_MS
      if (holdTimer.current) clearTimeout(holdTimer.current)
      holdTimer.current = setTimeout(() => {
        setFeedback(null)
        setScanAttempt((attempt) => attempt + 1)
      }, hold)
    },
    [scans, unitBySerial],
  )

  const { videoRef, isSupported, permissionError } = useBarcodeScanner(
    registerBarcode,
    !isLoading && !error && !isFinishOpen && !isSaving,
    scanAttempt,
  )

  function handleManualAdd() {
    const suffix = manualSerial.trim()
    if (!suffix) return
    registerBarcode(suffix)
    setManualSerial('')
  }

  function handleManualKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleManualAdd()
    }
  }

  async function handleFinish() {
    if (isSaving) return
    setSaving(true)
    setSaveError(null)

    // Every unit in inventory plus every unrecognised barcode, so the report
    // can be read back without the inventory it was taken against.
    const entries: RecordInventoryAuditEntry[] = [
      ...classified.map(({ unit, status, scannedAt }) => ({
        status,
        serialNumber: unit.serialNumber,
        equipmentUnitId: unit.unitId,
        equipmentId: unit.equipmentId,
        equipmentName: unit.equipmentName,
        memberName: unit.memberName,
        scannedAt,
      })),
      ...unrecognized.map((scan) => ({
        status: 'unrecognized' as const,
        serialNumber: scan.serial,
        scannedAt: scan.at,
      })),
    ]

    try {
      const auditId = await recordInventoryAudit(entries, note.trim() || null)
      setFinishOpen(false)
      navigate(`/adminHome/inventory/audit/${auditId}`, { replace: true })
    } catch (recordError) {
      // eslint-disable-next-line no-console
      console.error('Failed to record the inventory audit:', recordError)
      setFinishOpen(false)
      setSaveError('Could not record this audit. Nothing was saved — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  const progressPercent = counts.expected === 0 ? 0 : (counts.confirmed / counts.expected) * 100

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/adminHome/inventory/audit')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Perform inventory audit</h1>
          {/* Sits in the top row rather than below the lists: on a full shelf
              those lists scroll for pages, and the one control that ends the
              audit shouldn't be somewhere you have to scroll to find. */}
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.finishButton}
              onClick={() => setFinishOpen(true)}
              disabled={isLoading || error !== null || isSaving}
            >
              <CheckmarkIconFilled size={18} />
              <span>{isSaving ? 'Recording…' : 'Finish audit'}</span>
            </button>
          </div>
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading the inventory to audit…">
            <div className={styles.scanLayout}>
              <div className={styles.scanColumn}>
                <Skeleton height="12.5rem" radius="1.25rem" />
                <Skeleton width="80%" height="1rem" shape="pill" />
              </div>
              <div className={styles.card}>
                <Skeleton width="55%" height="1.5rem" shape="pill" />
                <Skeleton height="0.75rem" shape="pill" />
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} height="3.875rem" radius="0.9375rem" />
                ))}
              </div>
            </div>
          </SkeletonScreen>
        )}

        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && units.length === 0 && (
          <p className={styles.status}>
            There are no serialised hardware units in inventory to audit yet. Add a hardware item, and each
            of its units will appear here to be scanned.
          </p>
        )}

        {!isLoading && !error && units.length > 0 && (
          <>
            <div className={styles.scanLayout}>
              <div className={styles.scanColumn}>
                <div className={styles.scanFrame}>
                  {isSupported ? (
                    <video
                      ref={videoRef}
                      className={
                        feedback ? `${styles.scanVideo} ${styles.scanVideoBlurred}` : styles.scanVideo
                      }
                      muted
                      playsInline
                    />
                  ) : (
                    // Only reached if the WebAssembly scanner can't load at
                    // all — typing serials is the whole path then.
                    <p className={styles.scanPlaceholder}>
                      Barcode scanning isn&rsquo;t available here. Enter serial numbers by hand below.
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

                <p className={styles.scanCaption}>Scan all in-stock hardware item barcodes</p>

                <div className={styles.manualEntry}>
                  <label className={styles.manualLabel} htmlFor="audit-manual-serial">
                    Or enter a serial number by hand
                  </label>
                  <div className={styles.manualRow}>
                    <div className={styles.serialField}>
                      <span className={styles.serialPrefix} aria-hidden="true">
                        {SERIAL_PREFIX.replace('-', ' -')}
                      </span>
                      <input
                        id="audit-manual-serial"
                        className={styles.serialInput}
                        value={manualSerial}
                        onChange={(event) => setManualSerial(event.target.value)}
                        onKeyDown={handleManualKeyDown}
                        aria-label="Serial number"
                      />
                    </div>
                    <button
                      type="button"
                      className={styles.manualAddButton}
                      onClick={handleManualAdd}
                      disabled={!manualSerial.trim()}
                    >
                      Count it
                    </button>
                  </div>
                </div>

                <div className={styles.noteField}>
                  <label className={styles.manualLabel} htmlFor="audit-note">
                    Note for the report (optional)
                  </label>
                  <textarea
                    id="audit-note"
                    className={styles.noteInput}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Note any damage or special observations here"
                  />
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.progress}>
                  <div className={styles.progressHead}>
                    <span className={styles.progressLabel}>
                      {counts.confirmed} of {counts.expected} confirmed in stock
                    </span>
                    <span className={styles.progressSub}>
                      {counts.missing === 0
                        ? 'Everything in stock is accounted for'
                        : `${counts.missing} still to find`}
                    </span>
                  </div>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-valuenow={counts.confirmed}
                    aria-valuemin={0}
                    aria-valuemax={counts.expected}
                    aria-label="Units confirmed in stock"
                  >
                    <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                  </div>
                  <span className={styles.progressSub}>
                    {counts.checked_out} out on loan · {counts.discrepancies} flagged
                  </span>
                </div>

                <div className={styles.filterRow}>
                  {FILTERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        filter === option.value
                          ? `${styles.filterChip} ${styles.filterChipActive}`
                          : styles.filterChip
                      }
                      aria-pressed={filter === option.value}
                      onClick={() => setFilter(option.value)}
                    >
                      {option.label}
                      <span className={styles.filterChipCount}>{filterCounts[option.value]}</span>
                    </button>
                  ))}
                </div>

                {/* The flagged list is the only one that mixes two kinds of
                    finding, so it renders both rather than a filtered slice. */}
                {filter === 'discrepancies' ? (
                  visibleUnits.length === 0 && unrecognized.length === 0 ? (
                    <p className={styles.status}>Nothing has been flagged. Every barcode so far was expected.</p>
                  ) : (
                    <ul className={`${styles.unitList} ${styles.unitListScroll}`}>
                      {visibleUnits.map(({ unit, status, scannedAt }) => (
                        <UnitRow
                          key={unit.unitId}
                          name={unit.equipmentName}
                          serialNumber={unit.serialNumber}
                          imageUrl={unit.imageUrl}
                          note={unit.memberName ? `marked out with ${unit.memberName}` : 'marked out on loan'}
                          status={status}
                          scannedAt={scannedAt}
                        />
                      ))}
                      {unrecognized.map((scan) => (
                        <UnitRow
                          key={scan.serial}
                          name="Not in inventory"
                          serialNumber={scan.serial}
                          note="no hardware unit has this serial number"
                          status="unrecognized"
                          scannedAt={scan.at}
                        />
                      ))}
                    </ul>
                  )
                ) : visibleUnits.length === 0 ? (
                  <p className={styles.status}>
                    {filter === 'missing'
                      ? 'Nothing is missing — every unit the records placed in stock has been scanned.'
                      : filter === 'confirmed'
                        ? 'Nothing scanned yet. Point the camera at a barcode to start.'
                        : 'No hardware is currently out on loan.'}
                  </p>
                ) : (
                  <ul className={`${styles.unitList} ${styles.unitListScroll}`}>
                    {visibleUnits.map(({ unit, status, scannedAt }) => (
                      <UnitRow
                        key={unit.unitId}
                        name={unit.equipmentName}
                        serialNumber={unit.serialNumber}
                        imageUrl={unit.imageUrl}
                        note={
                          unit.expectation === 'checked_out' && unit.memberName
                            ? `out with ${unit.memberName}`
                            : null
                        }
                        status={status}
                        scannedAt={scannedAt}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {saveError && <p className={styles.inlineError}>{saveError}</p>}
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {/* The counts are repeated back before anything is written, because
          this is the last moment they can be changed: the audit is a snapshot
          and cannot be edited afterwards. */}
      <ConfirmActionModal
        isOpen={isFinishOpen}
        heading="Record this audit?"
        body={[
          `${counts.confirmed} of ${counts.expected} units confirmed in stock, ${counts.missing} missing.`,
          `${counts.checked_out} out on loan${
            counts.discrepancies > 0 ? `, ${counts.discrepancies} flagged for a closer look` : ''
          }.`,
          'A recorded audit is a snapshot of what was found. It cannot be edited or removed afterwards.',
        ]}
        confirmLabel={isSaving ? 'Recording…' : 'Record audit'}
        confirmDisabled={isSaving}
        onConfirm={() => void handleFinish()}
        onCancel={() => setFinishOpen(false)}
      />

      {/* Named for the assistive-tech announcement the chips' counts don't
          give on their own. */}
      <span className={styles.srOnly} role="status" aria-live="polite">
        {`${counts.confirmed} confirmed, ${counts.missing} missing, ${STATUS_LABEL.checked_out}: ${counts.checked_out}`}
      </span>
    </div>
  )
}
