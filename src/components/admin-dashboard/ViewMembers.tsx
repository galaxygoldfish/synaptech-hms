import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { SearchBar } from './SearchBar'
import { ArrowLeftIcon, HandleIcon, MailIcon } from './icons'
import { fetchAllProfiles } from '../../lib/members'
import type { Profile } from '../../types/index'
import type { UserProfile } from '../../types'
import styles from './ViewMembers.module.css'

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
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [members, setMembers] = useState<Profile[]>([])
  const [isLoading, setLoading] = useState(true)
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
        if (!cancelled) setError('Could not load members. Please try again.')
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
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

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
          {isLoading && <p className={styles.status}>Loading…</p>}
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

                    <span className={styles.memberJoined}>Joined {formatJoinedDate(member.created_at)}</span>
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
