import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, CloseIcon } from './icons'
import { fetchEmailLog, type EmailLogEntry, type EmailLogStatus } from '../../lib/emailLog'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './EmailLog.module.css'

type StatusFilter = 'all' | EmailLogStatus

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
]

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

function matchesQuery(entry: EmailLogEntry, query: string): boolean {
  const haystack = [
    entry.templateLabel,
    entry.templateKey,
    entry.recipientEmail,
    entry.ccEmail ?? '',
    entry.subject,
    entry.bodyText ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

// The reference badge (HardwareLoans' Active/Overdue/etc.) capitalizes via
// its own label map rather than a CSS transform, so this does the same.
const STATUS_LABEL: Record<EmailLogStatus, string> = {
  sent: 'Sent',
  failed: 'Failed',
}

// Wraps the stored HTML in a minimal document for the iframe — padding and
// a background so it reads as a panel, matching .bodyBox's look. The
// content itself (entry.bodyHtml) is untouched: this is presentation
// chrome around it, not a change to what was actually sent.
function buildPreviewDocument(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:1.75rem;background:#f2f2f2;box-sizing:border-box;">${bodyHtml}</body></html>`
}

function StatusBadge({ status }: { status: EmailLogStatus }) {
  return (
    <span
      className={
        status === 'sent'
          ? `${styles.statusBadge} ${styles.statusSent}`
          : `${styles.statusBadge} ${styles.statusFailed}`
      }
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function DetailModal({ entry, onClose }: { entry: EmailLogEntry; onClose: () => void }) {
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
        aria-label={`Email detail: ${entry.templateLabel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{entry.templateLabel}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles.metaList}>
          <div className={`${styles.metaRow} ${styles.metaRowSpaced}`}>
            <span className={styles.metaLabel}>Status</span>
            <span className={styles.metaValue}>
              <StatusBadge status={entry.status} />
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Sent at</span>
            <span className={styles.metaValue}>{formatTimestamp(entry.sentAt)}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>To</span>
            <span className={styles.metaValue}>{entry.recipientEmail}</span>
          </div>
          {entry.ccEmail && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>CC</span>
              <span className={styles.metaValue}>{entry.ccEmail}</span>
            </div>
          )}
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Subject</span>
            <span className={styles.metaValue}>{entry.subject || <em>(no subject)</em>}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Template</span>
            <span className={styles.metaValue}>{entry.templateKey}</span>
          </div>
        </div>

        {entry.error && (
          <div>
            <p className={styles.bodyLabel}>Failure reason</p>
            <p className={styles.errorBox}>{entry.error}</p>
          </div>
        )}

        <div>
          <p className={styles.bodyLabel}>Body</p>
          {entry.bodyHtml ? (
            // Rendered exactly as sent, signature included — but in a fully
            // sandboxed iframe. This HTML embeds admin/member-supplied data
            // (names, hardware, notes); it's escaped at render time in
            // render.ts, but this is the second, independent layer that
            // actually matters here — an empty `sandbox` blocks scripts,
            // forms, top navigation and same-origin access outright, so
            // even a script that slipped through escaping still couldn't
            // run or reach this page's session.
            <iframe
              title={`Email body — ${entry.templateLabel}`}
              sandbox=""
              srcDoc={buildPreviewDocument(entry.bodyHtml)}
              className={styles.bodyFrame}
            />
          ) : entry.bodyText === null ? (
            // An empty string is a real (if odd) email; null means the row
            // predates the body column. They're shown differently.
            <p className={`${styles.bodyBox} ${styles.bodyMissing}`}>
              Not recorded — this email was sent before the log stored message bodies.
            </p>
          ) : entry.bodyText.trim() === '' ? (
            <p className={`${styles.bodyBox} ${styles.bodyMissing}`}>
              This template has an empty body, so the email was sent with no message text.
            </p>
          ) : (
            <p className={styles.bodyBox}>{entry.bodyText}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EmailLog() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [entries, setEntries] = useState<EmailLogEntry[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<EmailLogEntry | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchEmailLog()
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the email log:', fetchError)
        if (!cancelled) setError('Could not load the email log. Please try again.')
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
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false
      if (trimmed && !matchesQuery(entry, trimmed)) return false
      return true
    })
  }, [entries, query, statusFilter])

  const failedCount = useMemo(() => entries.filter((e) => e.status === 'failed').length, [entries])

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
          <h1 className={styles.heading}>Automated email log</h1>
          <div />
        </div>

        <div className={styles.card}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <SearchBar value={query} onChange={setQuery} placeholder="Search by recipient, subject or content" />
            </div>
            <div className={styles.filterRow}>
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={
                    statusFilter === filter.value
                      ? `${styles.filterChip} ${styles.filterChipActive}`
                      : styles.filterChip
                  }
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                  {filter.value === 'failed' && failedCount > 0 ? ` (${failedCount})` : ''}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <SkeletonScreen label="Loading the email log…">
              <ul className={styles.logList}>
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.skeletonRow}>
                      <Skeleton width="5rem" height="1.75rem" shape="pill" style={{ gridArea: 'status' }} />
                      <div className={styles.templateCell}>
                        <Skeleton width="70%" height="1.0625rem" shape="pill" />
                        <Skeleton width="50%" height="0.875rem" shape="pill" />
                      </div>
                      <div className={styles.recipientCell}>
                        <Skeleton width="80%" height="1rem" shape="pill" />
                        <Skeleton width="55%" height="0.8125rem" shape="pill" />
                      </div>
                      <Skeleton width="9rem" height="0.9375rem" shape="pill" style={{ gridArea: 'sent' }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}

          {!isLoading && error && <p className={styles.status}>{error}</p>}

          {!isLoading && !error && entries.length === 0 && (
            <p className={styles.status}>
              No emails have been sent yet. Once the email service is deployed and a trigger fires,
              every send will appear here.
            </p>
          )}

          {!isLoading && !error && entries.length > 0 && visibleEntries.length === 0 && (
            <p className={styles.status}>No emails match your search.</p>
          )}

          {!isLoading && !error && visibleEntries.length > 0 && (
            <>
              <span className={styles.count}>
                Showing {visibleEntries.length} of {entries.length}
              </span>
              <ul className={styles.logList}>
                {visibleEntries.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className={styles.logItem} onClick={() => setSelected(entry)}>
                      <StatusBadge status={entry.status} />

                      <span className={styles.templateCell}>
                        <span className={styles.emailSubject}>{entry.subject || '(no subject)'}</span>
                        <span className={styles.templateType}>{entry.templateLabel}</span>
                      </span>

                      <span className={styles.recipientCell}>
                        <span className={styles.recipientEmail}>{entry.recipientEmail}</span>
                        {entry.ccEmail && <span className={styles.ccEmail}>cc {entry.ccEmail}</span>}
                      </span>

                      <span className={styles.sentAt}>{formatTimestamp(entry.sentAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
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
