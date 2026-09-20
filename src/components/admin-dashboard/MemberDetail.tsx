import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import ConfirmActionModal from '../ConfirmActionModal'
import { ArrowLeftIcon, CheckmarkIconFilled, CopyIcon, PersonIcon, TrashIconOutline } from './icons'
import { countAdmins, deleteMember, fetchProfileById, updateMemberRole } from '../../lib/members'
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
  /** Email, student ID, Discord — fields worth copying rather than retyping. */
  copyable?: boolean
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

function DetailRow({ label, value, copyable }: DetailRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {copyable ? <CopyableValue label={label} value={value} /> : <span className={styles.rowValue}>{value}</span>}
    </div>
  )
}

/**
 * A value plus a copy button, both wired to the same click — clicking the
 * text is as good as clicking the icon, since a field worth copying is a
 * field someone is about to paste somewhere else, not read on screen.
 */
function CopyableValue({ label, value }: { label: string; value: string }) {
  const [justCopied, setJustCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setJustCopied(true)
      window.setTimeout(() => setJustCopied(false), 1500)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to copy ${label.toLowerCase()} to clipboard:`, error)
    }
  }

  return (
    <button
      type="button"
      className={styles.rowValueCopy}
      onClick={() => void handleCopy()}
      aria-label={`${justCopied ? 'Copied' : 'Copy'} ${label}: ${value}`}
    >
      <span className={styles.rowValue} aria-hidden="true">
        {value}
      </span>
      {justCopied ? (
        <CheckmarkIconFilled size={14} color="var(--green-fg)" className={styles.rowCopyIcon} />
      ) : (
        <CopyIcon size={16} className={styles.rowCopyIcon} />
      )}
    </button>
  )
}

/**
 * A home address, hidden until an admin asks for it.
 *
 * Not removed, because it isn't decorative: it's printed on the loan
 * agreement each member signs (see AgreementPreview.tsx), and it's what the
 * club has to go on when hardware doesn't come back. Taking the row away
 * wouldn't even remove admin access — the signed PDF is downloadable from
 * the loan detail screen — it would only make a legitimate lookup harder.
 *
 * What's worth changing is the default: opening someone's profile to check
 * their Discord handle shouldn't also put their home address on screen, in
 * a room, on a shared laptop, over a screen share.
 */
function AddressRow({ address }: { address: string }) {
  const [isRevealed, setRevealed] = useState(false)

  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>Address</span>
      <span className={styles.rowValueGroup}>
        {isRevealed ? (
          <span className={styles.rowValue}>{address}</span>
        ) : (
          // Fixed-length mask: the real length of an address is itself a
          // detail worth not leaking, and a ragged row of dots would give it.
          <span className={styles.rowValueHidden} aria-hidden="true">
            ••••••••••••
          </span>
        )}
        <button
          type="button"
          className={styles.revealButton}
          onClick={() => setRevealed((wasRevealed) => !wasRevealed)}
          aria-expanded={isRevealed}
          // Someone tabbing between buttons hears only the label, and
          // "Reveal" on its own doesn't say reveal what.
          aria-label={isRevealed ? 'Hide home address' : 'Reveal home address'}
        >
          {isRevealed ? 'Hide' : 'Reveal'}
        </button>
      </span>
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

  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isLastAdmin, setLastAdmin] = useState(false)

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

  async function handleDelete() {
    if (!member) return
    setDeleteError(null)
    setLastAdmin(false)
    if (member.role === 'admin') {
      try {
        const adminCount = await countAdmins()
        setLastAdmin(adminCount <= 1)
      } catch (countError) {
        // eslint-disable-next-line no-console
        console.error('Failed to count admins:', countError)
      }
    }
    setDeleteModalOpen(true)
  }

  async function handleConfirmDelete() {
    if (!member) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteMember(member.id)
      setDeleteModalOpen(false)
      if (member.id === profile?.id) {
        signOut()
      } else {
        navigate('/adminHome/members')
      }
    } catch (deleteMemberError) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete member:', deleteMemberError)
      setDeleteError('Could not delete this account. Please try again.')
    } finally {
      setDeleting(false)
    }
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
              <DetailRow label="UW Email" value={member.uw_email} copyable />
              <DetailRow label="Student ID" value={member.student_id} copyable />
              <DetailRow label="Discord" value={member.discord} copyable />
              <DetailRow label="Phone #" value={member.phone} />
              <AddressRow address={member.address} />
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
              <button type="button" className={styles.deleteButton} onClick={() => void handleDelete()}>
                <TrashIconOutline size={18} color="rgba(0, 0, 0, 0.8)" />
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
            {deleteError && <p className={styles.status}>{deleteError}</p>}
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

      {member && (
        <ConfirmActionModal
          isOpen={isDeleteModalOpen}
          wide
          heading="Delete account?"
          body={[
            `Delete ${member.first_name} ${member.last_name}'s account? This cannot be undone.`,
            ...(isLastAdmin
              ? ['This is the only admin account — deleting it will lock everyone out of the admin dashboard.']
              : []),
            ...(member.id === profile?.id ? ['You will be signed out immediately.'] : []),
          ]}
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete account'}
          confirmDisabled={isDeleting}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  )
}
