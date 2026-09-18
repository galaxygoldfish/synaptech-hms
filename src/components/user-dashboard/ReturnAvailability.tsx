import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AvailabilityGrid, AvailabilityGridSkeleton, parseSlotKey } from './AvailabilityGrid'
import { CheckmarkIcon } from './icons'
import { requestReturn } from '../../lib/availability'
import { fetchMemberLoanItem, isOutWithMember, memberLoanState, type MemberLoanItem } from '../../lib/memberLoans'
import type { UserProfile } from '../../types'
import styles from './ReturnAvailability.module.css'

/**
 * Raising a return: the member says when they are free over the next two
 * weeks, and the item goes into the queue for a Hardware Manager to collect.
 *
 * The mirror of the checkout flow's availability step, and the same grid —
 * the admin reading the answer sees one kind of schedule whichever end of the
 * loan it came from.
 */
export default function ReturnAvailability() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [item, setItem] = useState<MemberLoanItem | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchMemberLoanItem(id)
      .then((loan) => {
        if (cancelled) return
        // Only hardware actually in the member's hands can be handed back.
        // Reaching this by URL for anything else is a dead end, so it says so
        // rather than offering a grid that could never be submitted.
        if (!isOutWithMember(memberLoanState(loan))) {
          setError('This loan is not out with you, so there is nothing to return.')
          return
        }
        if (loan.returnRequestedAt) {
          setError('You have already asked to return this. A Hardware Manager will be in touch.')
          return
        }
        setItem(loan)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the loan:', fetchError)
        if (!cancelled) setError('Could not load this loan. Please try again.')
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

  async function handleSubmit() {
    if (!item || !profile || selected.size === 0 || isSubmitting) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      await requestReturn({
        loanRequestId: item.loanRequestId,
        loanRequestItemId: item.id,
        memberId: profile.id,
        slots: [...selected].map(parseSlotKey),
      })
      setSubmitted(true)
    } catch (returnError) {
      // eslint-disable-next-line no-console
      console.error('Failed to submit the return request:', returnError)
      setSubmitError('Could not submit your return request. Please try again.')
      setSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className={styles.page}>
        <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

        <main className={styles.successMain}>
          <div className={styles.successBadge}>
            <CheckmarkIcon size={36} className={styles.successIcon} />
          </div>
          <h1 className={styles.successHeading}>Success!</h1>
          <p className={styles.successText}>
            Your request to return hardware was submitted successfully
          </p>
          <p className={styles.successText}>
            One of our Hardware Managers will reach out to you to schedule a pickup time soon
          </p>
          <button
            type="button"
            className={styles.doneButton}
            onClick={() => navigate('/home/loans', { replace: true })}
          >
            done
          </button>
        </main>

        {isProfileOpen && user && (
          <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
        )}
      </div>
    )
  }

  const canSubmit = selected.size > 0 && item !== null && !isSubmitting

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <h1 className={styles.heading}>Initiate hardware return</h1>
        <p className={styles.subtext}>
          Please enter your availability for the next two weeks in the table below.
        </p>
        <p className={styles.subtext}>
          This information is collected to help our Hardware Managers schedule a pickup time with you
        </p>

        {isLoading && (
          <div className={styles.gridWrap}>
            <AvailabilityGridSkeleton />
          </div>
        )}

        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && item && (
          <AvailabilityGrid
            selected={selected}
            onChange={setSelected}
            className={styles.gridWrap}
          />
        )}

        {submitError && <p className={styles.status}>{submitError}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(`/home/loans/${id}`)}
          >
            back
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {isSubmitting ? 'submitting…' : 'done'}
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
