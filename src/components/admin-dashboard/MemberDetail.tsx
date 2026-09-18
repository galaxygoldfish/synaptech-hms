import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import ConfirmActionModal from '../ConfirmActionModal'
import { ArrowLeftIcon, PersonIcon, TrashIconFilled } from './icons'
import { fetchProfileById, updateMemberRole } from '../../lib/members'
import type { Profile } from '../../types/index'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './MemberDetail.module.css'

function formatRegistrationDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

interface DetailRowProps {
  label: string
  value: string
}

// Mirrors the rows rendered below once the member loads.
const DETAIL_LABELS = [
  'Name',
  'UW Email',
  'Student ID',
  'Discord',
  'Phone #',
  'Address',
  'Registration date',
  'Privilege level',
] as const

// Varied widths so the placeholder reads as data rather than a bar chart.
const SKELETON_VALUE_WIDTHS = ['9rem', '14rem', '7rem', '10rem', '8.5rem', '16rem', '11rem', '5rem']

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [member, setMember] = useState<Profile | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isRoleModalOpen, setRoleModalOpen] = useState(false)
  const [isUpdatingRole, setUpdatingRole] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchProfileById(id)
      .then((data) => {
        if (!cancelled) setMember(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load member:', fetchError)
        if (!cancelled) setError('Could not load this member. Please try again.')
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

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function handleDelete() {
    if (!member) return
    const confirmed = window.confirm(
      `Delete ${member.first_name} ${member.last_name}'s account? This cannot be undone.`,
    )
    if (!confirmed) return
    // Placeholder: actually deleting another user's auth account requires a
    // service-role key, which this client-side app doesn't have — this
    // needs a Supabase Edge Function (or similar backend) before it can do
    // anything for real.
    // eslint-disable-next-line no-console
    console.log('Delete account requested for:', member.id)
  }

  const targetRole: 'member' | 'admin' | null = member ? (member.role === 'admin' ? 'member' : 'admin') : null

  async function handleConfirmRoleChange() {
    if (!member || !targetRole) return
    setUpdatingRole(true)
    setRoleError(null)
    try {
      const updated = await updateMemberRole(member.id, targetRole)
      setMember(updated)
      setRoleModalOpen(false)
    } catch (updateError) {
      // eslint-disable-next-line no-console
      console.error('Failed to update member role:', updateError)
      setRoleError("Could not update this member's privilege level. Please try again.")
    } finally {
      setUpdatingRole(false)
    }
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/adminHome/members')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Member details</h1>
          <div />
        </div>

        {/* The field labels are static, so only the values shimmer — the
            card keeps its exact final height and nothing shifts. */}
        {isLoading && (
          <SkeletonScreen label="Loading member details…">
            <div className={styles.card}>
              {DETAIL_LABELS.map((label, index) => (
                <div key={label} className={styles.row}>
                  <span className={styles.rowLabel}>{label}</span>
                  <Skeleton
                    width={SKELETON_VALUE_WIDTHS[index % SKELETON_VALUE_WIDTHS.length]}
                    height="1.25rem"
                    shape="pill"
                  />
                </div>
              ))}
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && member && (
          <>
            <div className={styles.card}>
              <DetailRow label="Name" value={`${member.first_name} ${member.last_name}`} />
              <DetailRow label="UW Email" value={member.uw_email} />
              <DetailRow label="Student ID" value={member.student_id} />
              <DetailRow label="Discord" value={member.discord} />
              <DetailRow label="Phone #" value={member.phone} />
              <DetailRow label="Address" value={member.address} />
              <DetailRow label="Registration date" value={formatRegistrationDate(member.created_at)} />
              <div className={styles.row}>
                <span className={styles.rowLabel}>Privilege level</span>
                <span
                  className={
                    member.role === 'admin'
                      ? `${styles.privilegeBadge} ${styles.privilegeBadgeAdmin}`
                      : `${styles.privilegeBadge} ${styles.privilegeBadgeMember}`
                  }
                >
                  {member.role}
                </span>
              </div>
            </div>

            <div className={styles.actionsRow}>
              <button type="button" className={styles.deleteButton} onClick={handleDelete}>
                <TrashIconFilled size={18} color="rgba(0, 0, 0, 0.8)" />
                Delete account
              </button>
              {targetRole && (
                <button type="button" className={styles.roleButton} onClick={() => setRoleModalOpen(true)}>
                  <PersonIcon size={18} />
                  Change to {targetRole}
                </button>
              )}
            </div>

            {roleError && <p className={styles.status}>{roleError}</p>}
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {member && targetRole && (
        <ConfirmActionModal
          isOpen={isRoleModalOpen}
          wide
          heading="Change privilege level?"
          body={[
            `This will change ${member.first_name} ${member.last_name}'s privilege level to ${targetRole}.`,
            targetRole === 'admin'
              ? 'They will gain full administrator access to this system.'
              : 'They will lose administrator access to this system.',
          ]}
          confirmLabel={isUpdatingRole ? 'Updating…' : `Change to ${targetRole}`}
          confirmDisabled={isUpdatingRole}
          onConfirm={handleConfirmRoleChange}
          onCancel={() => setRoleModalOpen(false)}
        />
      )}
    </div>
  )
}
