import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, ClockIcon, HandleIcon, MailIcon, PersonIcon, SwapIcon } from './icons'
import {
  fetchAllProfiles,
  fetchLastGroupSync,
  groupLines,
  groupNames,
  GroupSyncBusyError,
  peekAllProfiles,
  syncMemberGroups,
  type GroupSyncRun,
} from '../../lib/members'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import type { Profile } from '../../types/index'
import type { UserProfile } from '../../types'
import styles from './ViewMembers.module.css'

function formatJoinedDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

function formatSyncTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function matchesQuery(member: Profile, query: string): boolean {
  const haystack =
    `${member.first_name} ${member.last_name} ${member.uw_email} ${member.discord} ${groupNames(member)}`.toLowerCase()
  return haystack.includes(query)
}

/** One line under the toolbar describing the latest group sync. */
function describeSyncRun(run: GroupSyncRun): string {
  if (!run.finished_at) return `Group sync in progress (started ${formatSyncTime(run.started_at)})`
  if (!run.ok) return `Last group sync failed ${formatSyncTime(run.finished_at)}${run.error ? `: ${run.error}` : ''}`
  return `Groups last synced ${formatSyncTime(run.finished_at)}`
}

export default function ViewMembers() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  // As last loaded, on the first render; the fetch below refreshes it.
  const [initialMembers] = useState(peekAllProfiles)
  const [members, setMembers] = useState<Profile[]>(initialMembers ?? [])
  const [isLoading, setLoading] = useState(initialMembers === null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [lastSync, setLastSync] = useState<GroupSyncRun | null>(null)
  const [isSyncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchLastGroupSync()
      .then((run) => {
        if (!cancelled) setLastSync(run)
      })
      .catch((syncError) => {
        // Only the status line depends on it; the list itself still works.
        // eslint-disable-next-line no-console
        console.error('Failed to load last group sync:', syncError)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncNotice(null)
    try {
      const result = await syncMemberGroups()
      setSyncNotice({
        tone: 'ok',
        text: `Synced ${result.sheetsScanned} group ${result.sheetsScanned === 1 ? 'sheet' : 'sheets'}: ${result.membersMatched} ${result.membersMatched === 1 ? 'member is' : 'members are'} in a group.`,
      })
    } catch (syncError) {
      // eslint-disable-next-line no-console
      console.error('Failed to sync member groups:', syncError)
      setSyncNotice({
        tone: 'error',
        text:
          syncError instanceof GroupSyncBusyError
            ? syncError.message
            : `Could not sync groups${syncError instanceof Error && syncError.message ? `: ${syncError.message}` : '.'}`,
      })
    } finally {
      setSyncing(false)
    }
    // Refresh both whether or not the sync succeeded — a failed run is
    // still recorded, and a partial one may have changed some rows.
    const [membersResult, runResult] = await Promise.allSettled([fetchAllProfiles(), fetchLastGroupSync()])
    if (membersResult.status === 'fulfilled') setMembers(membersResult.value)
    if (runResult.status === 'fulfilled') setLastSync(runResult.value)
  }

  useEffect(() => {
    let cancelled = false

    fetchAllProfiles()
      .then((items) => {
        if (!cancelled) setMembers(items)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load members:', fetchError)
        if (!cancelled && initialMembers === null) setError('Could not load members. Please try again.')
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

  const visibleMembers = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return members
    return members.filter((member) => matchesQuery(member, trimmed))
  }, [members, query])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/adminHome')} aria-label="Back">
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <div className={styles.searchWrap}>
            <SearchBar value={query} onChange={setQuery} placeholder="Search members" />
          </div>
          <button
            type="button"
            className={styles.syncButton}
            onClick={() => void handleSync()}
            disabled={isSyncing}
            aria-label={isSyncing ? 'Syncing project groups' : 'Sync project groups'}
          >
            <SwapIcon size={20} />
            <span>{isSyncing ? 'Syncing…' : 'Sync groups'}</span>
          </button>
        </div>

        {(lastSync || syncNotice) && (
          <div className={styles.syncStatus}>
            {syncNotice && (
              <p
                className={syncNotice.tone === 'error' ? styles.syncNoticeError : styles.syncNotice}
                role={syncNotice.tone === 'error' ? 'alert' : 'status'}
              >
                {syncNotice.text}
              </p>
            )}
            {lastSync && <p className={styles.syncLine}>{describeSyncRun(lastSync)}</p>}
            {lastSync && lastSync.warnings.length > 0 && (
              <details className={styles.syncWarnings}>
                <summary>
                  {lastSync.warnings.length} {lastSync.warnings.length === 1 ? 'warning' : 'warnings'} from the last sync
                </summary>
                <ul>
                  {lastSync.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className={styles.card}>
          {isLoading && (
            <SkeletonScreen label="Loading members…">
              <ul className={styles.memberList}>
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index}>
                    <div className={styles.skeletonRow}>
                      <Skeleton width="5.5rem" height="2.125rem" shape="pill" />
                      <Skeleton width="9rem" height="1.25rem" shape="pill" />
                      <Skeleton width="11rem" height="1.125rem" shape="pill" />
                      <Skeleton width="7rem" height="1.125rem" shape="pill" />
                      <Skeleton width="8rem" height="1rem" shape="pill" />
                    </div>
                  </li>
                ))}
              </ul>
            </SkeletonScreen>
          )}
          {!isLoading && error && <p className={styles.status}>{error}</p>}
          {!isLoading && !error && visibleMembers.length === 0 && (
            <p className={styles.status}>No members match your search.</p>
          )}

          {!isLoading && !error && visibleMembers.length > 0 && (
            <ul className={styles.memberList}>
              {visibleMembers.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    className={styles.memberItem}
                    onClick={() => navigate(`/adminHome/members/${member.id}`)}
                  >
                    <span
                      className={
                        member.role === 'admin'
                          ? `${styles.roleBadge} ${styles.roleBadgeAdmin}`
                          : `${styles.roleBadge} ${styles.roleBadgeMember}`
                      }
                    >
                      {member.role}
                    </span>

                    <p className={styles.memberName}>
                      {member.first_name} {member.last_name}
                    </p>

                    <span className={styles.memberDetail}>
                      <MailIcon size={18} />
                      <span>{member.uw_email}</span>
                    </span>

                    <span className={styles.memberDetail}>
                      <HandleIcon size={18} />
                      <span>{member.discord}</span>
                    </span>

                    <span className={`${styles.memberDetail} ${styles.memberGroup}`}>
                      <PersonIcon size={18} />
                      {/* One line per group, stacked, so a second group adds
                          height rather than pushing the row's columns over. */}
                      <span className={styles.groupLines}>
                        {groupLines(member).map((line, index) => (
                          <span key={index}>{line}</span>
                        ))}
                      </span>
                    </span>

                    <span className={styles.memberJoined}>
                      {/* Shown on phone only (see .memberJoinedIcon) — at
                          tablet and desktop it shares a row with an icon of
                          its own already (email or handle). */}
                      <ClockIcon size={18} className={styles.memberJoinedIcon} />
                      Joined {formatJoinedDate(member.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
