import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, PlusIconSmallFilled } from './icons'
import {
  fetchInventoryAudits,
  INVENTORY_AUDIT_LIMIT,
  type InventoryAuditSummary,
} from '../../lib/inventoryAudit'
import { formatAuditTimestamp } from './InventoryAuditParts'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './InventoryAudit.module.css'

/**
 * The history of inventory audits, newest first, with a "+" that starts a
 * new one. Deliberately the audit log's screen in miniature — same card,
 * toolbar, row grid and badge palette — because it answers the same kind of
 * question: what has been done, by whom, and when.
 */

function discrepancyCount(audit: InventoryAuditSummary): number {
  return audit.foundCheckedOutCount + audit.unrecognizedCount
}

/**
 * The single badge that stands for the whole audit. Missing hardware
 * outranks everything else: it's the finding an audit exists to surface, and
 * a row that led with "3 discrepancies" while two units were unaccounted for
 * would bury it.
 */
function outcomeBadge(audit: InventoryAuditSummary): { label: string; className: string } {
  if (audit.missingCount > 0) {
    return {
      label: audit.missingCount === 1 ? '1 missing' : `${audit.missingCount} missing`,
      className: styles.badgeMissing,
    }
  }
  const discrepancies = discrepancyCount(audit)
  if (discrepancies > 0) {
    return {
      label: discrepancies === 1 ? '1 discrepancy' : `${discrepancies} discrepancies`,
      className: styles.badgeFoundCheckedOut,
    }
  }
  return { label: 'All accounted for', className: styles.badgeConfirmed }
}

/** "Confirmed 38 of 40 in stock" — the headline of the row. */
function summaryLine(audit: InventoryAuditSummary): string {
  return `Confirmed ${audit.confirmedCount} of ${audit.expectedCount} ${
    audit.expectedCount === 1 ? 'unit' : 'units'
  } in stock`
}

function auditorName(audit: InventoryAuditSummary): string {
  return audit.performedByName ?? 'Unknown administrator'
}

/** "Performed by Ada Admin · admin@uw.edu", on one line under the headline. */
function performedByLine(audit: InventoryAuditSummary): string {
  const email = audit.performedByEmail
  return `Performed by ${auditorName(audit)}${email ? ` · ${email}` : ''}`
}

function matchesQuery(audit: InventoryAuditSummary, query: string): boolean {
  return [
    auditorName(audit),
    audit.performedByEmail ?? '',
    audit.note ?? '',
    formatAuditTimestamp(audit.performedAt),
    summaryLine(audit),
    outcomeBadge(audit).label,
  ]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

export default function InventoryAudit() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [audits, setAudits] = useState<InventoryAuditSummary[]>([])
  const [isCapped, setCapped] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    fetchInventoryAudits()
      .then((page) => {
        if (cancelled) return
        setAudits(page.audits)
        setCapped(page.hasMore)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventory audits:', fetchError)
        if (!cancelled) setError('Could not load past audits. Please try again.')
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

  const visibleAudits = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return audits
    return audits.filter((audit) => matchesQuery(audit, trimmed))
  }, [audits, query])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/adminHome')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Inventory audit</h1>
          <div />
        </div>

        <div className={styles.card}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <SearchBar value={query} onChange={setQuery} placeholder="Search past audits" />
            </div>
            <button
              type="button"
              className={styles.newAuditButton}
              onClick={() => navigate('/adminHome/inventory/audit/new')}
            >
              <PlusIconSmallFilled size={15} color="#4a647f" />
              New audit
            </button>
          </div>

          {isLoading && (
            <SkeletonScreen label="Loading past audits…">
              <ul className={styles.auditList}>
                {Array.from({ length: 4 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.auditSkeletonRow}>
                      <Skeleton width="9rem" height="1.75rem" shape="pill" style={{ gridArea: 'outcome' }} />
                      <div className={styles.summaryCell}>
                        <Skeleton width="65%" height="1.0625rem" shape="pill" style={{ gridArea: 'headline' }} />
                        <Skeleton width="45%" height="0.875rem" shape="pill" style={{ gridArea: 'sub' }} />
                      </div>
                      <Skeleton width="11rem" height="0.9375rem" shape="pill" style={{ gridArea: 'time' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}

          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && audits.length === 0 && (
            <p className={styles.status}>
              No audits have been recorded yet. Start one with <strong>New audit</strong> and scan the
              hardware on the shelf in any order — the count of what is still missing updates as you go.
            </p>
          )}

          {!isLoading && !error && audits.length > 0 && visibleAudits.length === 0 && (
            <p className={styles.status}>No past audits match your search.</p>
          )}

          {!isLoading && !error && visibleAudits.length > 0 && (
            <>
              <span className={styles.count}>
                Showing {visibleAudits.length} of {audits.length}
                {isCapped ? ` most recent (more than ${INVENTORY_AUDIT_LIMIT} have been recorded)` : ''}
              </span>
              <ul className={styles.auditList}>
                {visibleAudits.map((audit) => {
                  const badge = outcomeBadge(audit)
                  return (
                    <li key={audit.id}>
                      <button
                        type="button"
                        className={styles.auditItem}
                        onClick={() => navigate(`/adminHome/inventory/audit/${audit.id}`)}
                      >
                        <span className={`${styles.badge} ${badge.className} ${styles.outcomeChip}`}>
                          {badge.label}
                        </span>

                        <span className={styles.summaryCell}>
                          <span className={styles.summaryText}>{summaryLine(audit)}</span>
                          <span className={styles.summarySub}>{performedByLine(audit)}</span>
                        </span>

                        <span className={styles.performedAt}>{formatAuditTimestamp(audit.performedAt)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
