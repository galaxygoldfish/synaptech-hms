import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, CloseIcon } from './icons'
import {
  AUDIT_LOG_LIMIT,
  AUDIT_LOG_RETENTION_MONTHS,
  fetchAuditLog,
  type AuditCategory,
  type AuditChange,
  type AuditLogEntry,
} from '../../lib/auditLog'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './AuditLog.module.css'

type CategoryFilter = 'all' | AuditCategory

const FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'members', label: 'Members' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'loans', label: 'Loans' },
  { value: 'emails', label: 'Emails' },
]

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  members: 'Members',
  inventory: 'Inventory',
  loans: 'Loans',
  emails: 'Emails',
}

const CATEGORY_CLASS: Record<AuditCategory, string> = {
  members: styles.categoryMembers,
  inventory: styles.categoryInventory,
  loans: styles.categoryLoans,
  emails: styles.categoryEmails,
}

// Every action the triggers in 20260921000000_audit_log.sql can write.
// Anything missing falls back to the raw dotted key rather than rendering
// blank, so adding a trigger without touching this file degrades to
// "member.suspended" instead of an empty badge.
const ACTION_LABEL: Record<string, string> = {
  'member.signed_up': 'Account created',
  'member.role_changed': 'Role changed',
  'member.profile_updated': 'Profile updated',
  'member.deleted': 'Account removed',
  'equipment.created': 'Item added',
  'equipment.updated': 'Item updated',
  'equipment.deleted': 'Item removed',
  'equipment_unit.created': 'Unit added',
  'equipment_unit.deleted': 'Unit removed',
  'equipment_addon.linked': 'Add-on linked',
  'equipment_addon.unlinked': 'Add-on unlinked',
  'loan_request.submitted': 'Checkout requested',
  'loan_request.approved': 'Checkout approved',
  'loan_request.denied': 'Checkout denied',
  'loan_request.status_changed': 'Status changed',
  'loan_request.deleted': 'Request deleted',
  'loan_item.requested': 'Item requested',
  'loan_item.updated': 'Item updated',
  'loan_item.removed': 'Item removed',
  'email_template.updated': 'Template edited',
  'email_template.enabled': 'Email turned on',
  'email_template.disabled': 'Email turned off',
}

const ENTITY_LABEL: Record<string, string> = {
  member: 'Member',
  equipment: 'Hardware item',
  equipment_unit: 'Hardware unit',
  loan_request: 'Checkout request',
  loan_request_item: 'Requested item',
  email_template: 'Email template',
}

const FIELD_LABEL: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  uw_email: 'UW email',
  discord: 'Discord',
  phone: 'Phone number',
  student_id: 'Student ID',
  address: 'Address',
  role: 'Role',
  name: 'Name',
  description: 'Description',
  product_type: 'Product type',
  category: 'Category',
  replacement_value: 'Replacement value',
  quantity_total: 'Quantity',
  documentation_url: 'Documentation link',
  image_url: 'Product photo',
  status: 'Status',
  review_note: 'Review note',
  equipment_unit_id: 'Assigned unit',
  return_date: 'Return date',
  signed_agreement_path: 'Signed agreement',
  item_role: 'Item role',
  subject: 'Subject line',
  body: 'Message body',
  enabled: 'Enabled',
  dynamic_fields: 'Dynamic fields',
  label: 'Template name',
}

// The two reasons a change's values aren't in the log, spelled out where an
// admin reads them — a bare "hidden" would look like a bug rather than the
// deliberate choice it is. See AuditHiddenReason in lib/auditLog.ts.
const HIDDEN_NOTE: Record<string, string> = {
  pii: 'Changed — values not kept in the log, as they are personal details.',
  content: 'Content edited — open the template to see how it reads now.',
}

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

function entityLabel(entityType: string): string {
  return ENTITY_LABEL[entityType] ?? entityType.replace(/_/g, ' ')
}

function fieldLabel(field: string): string {
  const known = FIELD_LABEL[field]
  if (known) return known
  const spaced = field.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Values arrive as the text form of whatever column changed. Empty and
// boolean columns are the two that read badly raw ("" and "true"), so only
// those are translated — everything else is shown exactly as stored rather
// than second-guessed into something prettier than the truth.
function formatValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') return 'empty'
  if (value === 'true') return 'yes'
  if (value === 'false') return 'no'
  return value
}

function CategoryBadge({ category }: { category: AuditCategory }) {
  return (
    <span className={`${styles.categoryBadge} ${CATEGORY_CLASS[category]}`}>
      {CATEGORY_LABEL[category]}
    </span>
  )
}

/** "Jane Doe", or "System" for anything no signed-in user performed. */
function actorName(entry: AuditLogEntry): string {
  return entry.actorName ?? 'System'
}

function actorDetail(entry: AuditLogEntry): string {
  return entry.actorEmail ?? 'Automated or direct database change'
}

function matchesQuery(entry: AuditLogEntry, query: string): boolean {
  const haystack = [
    entry.summary,
    actionLabel(entry.action),
    entry.action,
    entry.entityLabel ?? '',
    entry.entityKey ?? '',
    entityLabel(entry.entityType),
    actorName(entry),
    entry.actorEmail ?? '',
    CATEGORY_LABEL[entry.category],
    ...entry.changes.map((change) => fieldLabel(change.field)),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function ChangeRow({ change }: { change: AuditChange }) {
  return (
    <li className={styles.changeRow}>
      <span className={styles.changeField}>{fieldLabel(change.field)}</span>
      {change.hidden ? (
        <span className={styles.changeHidden}>{HIDDEN_NOTE[change.hidden] ?? 'Changed.'}</span>
      ) : (
        <span className={styles.changeValues}>
          <span className={styles.changeFrom}>{formatValue(change.from)}</span>
          <span aria-hidden="true" className={styles.changeArrow}>
            →
          </span>
          <span className={styles.srOnly}>changed to</span>
          <span className={styles.changeTo}>{formatValue(change.to)}</span>
        </span>
      )}
    </li>
  )
}

function DetailModal({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Audit entry: ${actionLabel(entry.action)}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{actionLabel(entry.action)}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <p className={styles.modalSummary}>{entry.summary}</p>

        <div className={styles.metaList}>
          <div className={`${styles.metaRow} ${styles.metaRowSpaced}`}>
            <span className={styles.metaLabel}>Category</span>
            <span className={styles.metaValue}>
              <CategoryBadge category={entry.category} />
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>When</span>
            <span className={styles.metaValue}>{formatTimestamp(entry.occurredAt)}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Performed by</span>
            <span className={styles.metaValue}>
              {actorName(entry)}
              <span className={styles.metaSub}>{actorDetail(entry)}</span>
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Affected</span>
            <span className={styles.metaValue}>
              {entry.entityLabel || <em>(no longer named)</em>}
              <span className={styles.metaSub}>{entityLabel(entry.entityType)}</span>
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Event</span>
            <span className={styles.metaValue}>{entry.action}</span>
          </div>
          {(entry.entityKey || entry.entityId) && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Record</span>
              <span className={styles.metaValue}>{entry.entityKey ?? entry.entityId}</span>
            </div>
          )}
        </div>

        <div>
          <p className={styles.changesLabel}>What changed</p>
          {entry.changes.length > 0 ? (
            <ul className={styles.changeList}>
              {entry.changes.map((change) => (
                <ChangeRow key={change.field} change={change} />
              ))}
            </ul>
          ) : (
            // Creations and deletions have no field-level diff: the whole
            // record arrived or went away, which the summary already says.
            <p className={`${styles.changeBox} ${styles.changeEmpty}`}>
              No field-level changes were recorded for this event.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuditLog() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [isCapped, setCapped] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchAuditLog()
      .then((page) => {
        if (cancelled) return
        setEntries(page.entries)
        setCapped(page.hasMore)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the audit log:', fetchError)
        if (!cancelled) setError('Could not load the audit log. Please try again.')
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

  const visibleEntries = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false
      if (trimmed && !matchesQuery(entry, trimmed)) return false
      return true
    })
  }, [entries, query, categoryFilter])

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
          <h1 className={styles.heading}>App audit log</h1>
          <div />
        </div>

        <div className={styles.card}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <SearchBar
                value={query}
                onChange={setQuery}
                placeholder="Search by person, item or what changed"
              />
            </div>
            <div className={styles.filterRow}>
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={
                    categoryFilter === filter.value
                      ? `${styles.filterChip} ${styles.filterChipActive}`
                      : styles.filterChip
                  }
                  aria-pressed={categoryFilter === filter.value}
                  onClick={() => setCategoryFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <SkeletonScreen label="Loading the audit log…">
              <ul className={styles.logList}>
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.skeletonRow}>
                      <Skeleton width="6rem" height="1.75rem" shape="pill" style={{ gridArea: 'category' }} />
                      <div className={styles.summaryCell}>
                        <Skeleton width="75%" height="1.0625rem" shape="pill" />
                        <Skeleton width="40%" height="0.875rem" shape="pill" />
                      </div>
                      <div className={styles.actorCell}>
                        <Skeleton width="70%" height="1rem" shape="pill" />
                        <Skeleton width="50%" height="0.8125rem" shape="pill" />
                      </div>
                      <Skeleton width="9rem" height="0.9375rem" shape="pill" style={{ gridArea: 'time' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}

          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && entries.length === 0 && (
            <p className={styles.status}>
              Nothing has been recorded yet. Sign-ups, role changes, inventory edits and checkout
              activity will appear here as they happen.
            </p>
          )}

          {!isLoading && !error && entries.length > 0 && visibleEntries.length === 0 && (
            <p className={styles.status}>No activity matches your search.</p>
          )}

          {!isLoading && !error && visibleEntries.length > 0 && (
            <>
              <span className={styles.count}>
                Showing {visibleEntries.length} of {entries.length}
                {isCapped ? ` most recent (the log keeps more than ${AUDIT_LOG_LIMIT})` : ''}
              </span>
              <ul className={styles.logList}>
                {visibleEntries.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className={styles.logItem} onClick={() => setSelected(entry)}>
                      <CategoryBadge category={entry.category} />

                      <span className={styles.summaryCell}>
                        <span className={styles.summaryText}>{entry.summary}</span>
                        <span className={styles.actionType}>{actionLabel(entry.action)}</span>
                      </span>

                      <span className={styles.actorCell}>
                        <span className={styles.actorName}>{actorName(entry)}</span>
                        <span className={styles.actorEmail}>{actorDetail(entry)}</span>
                      </span>

                      <span className={styles.occurredAt}>{formatTimestamp(entry.occurredAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Stated rather than left to be discovered: an audit log that
                  quietly drops its oldest entries is worse than one that
                  says it does, because the absence reads as "it never
                  happened". */}
              <p className={styles.footnote}>
                Entries older than {AUDIT_LOG_RETENTION_MONTHS} months are removed automatically.
              </p>
            </>
          )}
        </div>
      </main>

      {selected && <DetailModal entry={selected} onClose={() => setSelected(null)} />}

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
