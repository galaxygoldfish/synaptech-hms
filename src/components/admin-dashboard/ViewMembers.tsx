import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, ClockIcon, HandleIcon, MailIcon } from './icons'
import { fetchAllProfiles, peekAllProfiles } from '../../lib/members'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import type { Profile } from '../../types/index'
import type { UserProfile } from '../../types'
import styles from './ViewMembers.module.css'
import { PENDING_ROW_STYLE, usePrefetchNavigate } from '../../lib/usePrefetchNavigate'
import { memberDetailKey } from '../../lib/detailKeys'
import { fetchProfileById } from '../../lib/members'

function formatJoinedDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()} ${date.getFullYear()}`
}

function matchesQuery(member: Profile, query: string): boolean {
  const haystack = `${member.first_name} ${member.last_name} ${member.uw_email} ${member.discord}`.toLowerCase()
  return haystack.includes(query)
}

export default function ViewMembers() {
  const navigate = useNavigate()
  const { open, pendingKey } = usePrefetchNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  // As last loaded, on the first render; the fetch below refreshes it.
  const [initialMembers] = useState(peekAllProfiles)
  const [members, setMembers] = useState<Profile[]>(initialMembers ?? [])
  const [isLoading, setLoading] = useState(initialMembers === null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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
        </div>

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
                    onClick={() =>
                      void open(memberDetailKey(member.id), () => fetchProfileById(member.id), `/adminHome/members/${member.id}`)
                    }
                    aria-busy={pendingKey === memberDetailKey(member.id)}
                    style={pendingKey === memberDetailKey(member.id) ? PENDING_ROW_STYLE : undefined}
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
