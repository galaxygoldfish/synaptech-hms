import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { ArrowLeftIcon } from './icons'
import {
  fetchInventoryAudit,
  type InventoryAuditDetail,
  type InventoryAuditEntry,
  type InventoryAuditStatus,
} from '../../lib/inventoryAudit'
import { formatAuditTimestamp, STATUS_EXPLANATION, STATUS_LABEL, UnitRow } from './InventoryAuditParts'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './InventoryAudit.module.css'

/**
 * What one past audit found: the four headline counts, who ran it and when,
 * and every unit it accounted for.
 *
 * Read entirely out of `inventory_audits` / `inventory_audit_entries` — it
 * deliberately does not re-check any of it against inventory as it stands
 * now. A report is a statement about a moment, and one that quietly updated
 * itself would answer a different question every time it was opened.
 */

type EntryFilter = 'all' | 'confirmed' | 'missing' | 'checked_out' | 'flagged'

const FILTERS: { value: EntryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  // Missing ahead of confirmed: on a report, the shortfall is what gets
  // looked up, and on the two chips that matter it should be the nearer one.
  { value: 'missing', label: 'Missing' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'flagged', label: 'Flagged' },
]

const FLAGGED: InventoryAuditStatus[] = ['found_checked_out', 'unrecognized']

function matchesFilter(entry: InventoryAuditEntry, filter: EntryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'flagged') return FLAGGED.includes(entry.status)
  return entry.status === filter
}

/** The second line of a row: who had it, or why it's listed at all. */
function entryNote(entry: InventoryAuditEntry): string | null {
  if (entry.status === 'unrecognized') return 'no hardware unit has this serial number'
  if (entry.status === 'found_checked_out') {
    return entry.memberName ? `marked out with ${entry.memberName}` : 'marked out on loan'
  }
  if (entry.status === 'checked_out') {
    return entry.memberName ? `out with ${entry.memberName}` : 'out on loan'
  }
  return null
}

export default function InventoryAuditReport() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [audit, setAudit] = useState<InventoryAuditDetail | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<EntryFilter>('all')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchInventoryAudit(id)
      .then((detail) => {
        if (!cancelled) setAudit(detail)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the inventory audit:', fetchError)
        if (!cancelled) setError('Could not load this audit. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

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

  const filterCounts = useMemo<Record<EntryFilter, number>>(() => {
    const entries = audit?.entries ?? []
    return {
      all: entries.length,
      missing: entries.filter((entry) => entry.status === 'missing').length,
      confirmed: entries.filter((entry) => entry.status === 'confirmed').length,
      checked_out: entries.filter((entry) => entry.status === 'checked_out').length,
      flagged: entries.filter((entry) => FLAGGED.includes(entry.status)).length,
    }
  }, [audit])

  const visibleEntries = useMemo(() => {
    const entries = audit?.entries ?? []
    // Findings before settled rows within whatever the filter allows: a
    // report opened on "All" should start with what needs doing.
    const rank: Record<InventoryAuditStatus, number> = {
      missing: 0,
      found_checked_out: 1,
      unrecognized: 2,
      confirmed: 3,
      checked_out: 4,
    }
    return entries
      .filter((entry) => matchesFilter(entry, filter))
      .sort((a, b) => rank[a.status] - rank[b.status] || a.serialNumber.localeCompare(b.serialNumber))
  }, [audit, filter])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  const discrepancies = audit ? audit.foundCheckedOutCount + audit.unrecognizedCount : 0

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
          <h1 className={styles.heading}>Inventory audit report</h1>
          <div />
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading the audit report…">
            <div className={styles.card}>
              <div className={styles.tileGrid}>
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} height="5.75rem" radius="0.9375rem" />
                ))}
              </div>
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} height="3.875rem" radius="0.9375rem" />
              ))}
            </div>
          </SkeletonScreen>
        )}

        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && audit && (
          <>
            <div className={styles.card}>
              <div className={styles.tileGrid}>
                <div className={`${styles.tile} ${styles.tileConfirmed}`}>
                  <span className={styles.tileValue}>{audit.confirmedCount}</span>
                  <span className={styles.tileLabel}>Confirmed in stock</span>
                </div>
                <div className={`${styles.tile} ${styles.tileMissing}`}>
                  <span className={styles.tileValue}>{audit.missingCount}</span>
                  <span className={styles.tileLabel}>Missing</span>
                </div>
                <div className={`${styles.tile} ${styles.tileCheckedOut}`}>
                  <span className={styles.tileValue}>{audit.checkedOutCount}</span>
                  <span className={styles.tileLabel}>Checked out</span>
                </div>
                <div className={`${styles.tile} ${styles.tileDiscrepancies}`}>
                  <span className={styles.tileValue}>{discrepancies}</span>
                  <span className={styles.tileLabel}>Flagged</span>
                </div>
              </div>

              <div className={styles.metaList}>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Performed</span>
                  <span className={styles.metaValue}>{formatAuditTimestamp(audit.performedAt)}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Performed by</span>
                  <span className={styles.metaValue}>
                    {audit.performedByName ?? 'Unknown administrator'}
                    <span className={styles.metaSub}>{audit.performedByEmail ?? '—'}</span>
                  </span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Units accounted for</span>
                  <span className={styles.metaValue}>
                    {audit.expectedCount + audit.checkedOutCount + audit.foundCheckedOutCount}
                  </span>
                </div>
                {audit.note && (
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Note</span>
                    <span className={styles.metaValue}>{audit.note}</span>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.card}>
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

              {/* What the badges below actually mean, once, rather than a
                  legend the reader has to infer from five colours. */}
              {filter !== 'all' && filter !== 'flagged' && (
                <p className={styles.sectionLabel}>{STATUS_EXPLANATION[filter]}</p>
              )}
              {filter === 'flagged' && (
                <p className={styles.sectionLabel}>
                  {STATUS_LABEL.found_checked_out}: {STATUS_EXPLANATION.found_checked_out}.{' '}
                  {STATUS_LABEL.unrecognized}: {STATUS_EXPLANATION.unrecognized}.
                </p>
              )}

              {visibleEntries.length === 0 ? (
                <p className={styles.status}>
                  {filter === 'all'
                    ? 'This audit recorded no units. There was nothing in inventory to scan at the time.'
                    : 'Nothing in this audit falls under that heading.'}
                </p>
              ) : (
                <ul className={styles.unitList}>
                  {visibleEntries.map((entry) => (
                    <UnitRow
                      key={entry.id}
                      name={entry.equipmentName ?? 'Not in inventory'}
                      serialNumber={entry.serialNumber}
                      imageUrl={entry.imageUrl}
                      note={entryNote(entry)}
                      status={entry.status}
                      scannedAt={entry.scannedAt}
                    />
                  ))}
                </ul>
              )}

            </div>
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
