import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AvailabilityModal } from './AvailabilityModal'
import { ArrowLeftIcon, CalendarIcon, DownloadIconFilled } from './icons'
import {
  bucketForLoanItem,
  fetchLoanRequestItemDetail,
  fetchSignedAgreementUrl,
  type AdminLoanRequestDetail,
  type LoanBucket,
} from '../../lib/loanRequests'
import type { LoanRequestItemRole, UserProfile } from '../../types'
import styles from './LoanDetail.module.css'

const BADGE_CLASS: Record<LoanBucket, string> = {
  active: styles.badgeActive,
  overdue: styles.badgeOverdue,
  requests: styles.badgeRequests,
  returns: styles.badgeReturns,
}

const BADGE_LABEL: Record<LoanBucket, string> = {
  active: 'Active',
  overdue: 'Overdue',
  requests: 'Checkout requested',
  returns: 'Return requested',
}

const ROLE_LABEL: Record<LoanRequestItemRole, string> = {
  primary: 'Primary item',
  optional_addon: 'Optional add-on',
  required_addon: 'Required add-on',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${date.getDate()} ${date.getFullYear()}`
}

function formatCalendarDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return `${date.toLocaleDateString(undefined, { month: 'long' })} ${date.getDate()} ${date.getFullYear()}`
}

interface DetailRowProps {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  )
}

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [detail, setDetail] = useState<AdminLoanRequestDetail | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isDownloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [isAvailabilityOpen, setAvailabilityOpen] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLoanRequestItemDetail(id)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load loan:', fetchError)
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

  const bucket = detail ? bucketForLoanItem(detail) : null

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  async function handleDownloadAgreement() {
    if (!detail?.signedAgreementPath || isDownloading) return
    setDownloading(true)
    setDownloadError(null)

    try {
      const url = await fetchSignedAgreementUrl(detail.signedAgreementPath)
      window.open(url, '_blank', 'noopener')
    } catch (fetchError) {
      // eslint-disable-next-line no-console
      console.error('Failed to get signed agreement:', fetchError)
      setDownloadError('Could not open the signed agreement. Please try again.')
    } finally {
      setDownloading(false)
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
            onClick={() => navigate('/adminHome/loans')}
            aria-label="Back"
          >
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>Loan details</h1>
          <div />
        </div>

        {isLoading && <p className={styles.status}>Loading…</p>}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && detail && bucket && (
          <>
            <div className={styles.itemCard}>
              {detail.imageUrl && <img src={detail.imageUrl} alt="" className={styles.itemThumb} />}
              <div className={styles.itemInfo}>
                <p className={styles.itemName}>{detail.itemName}</p>
                <p className={styles.itemMeta}>
                  {detail.serialNumber && <span>{detail.serialNumber}</span>}
                  <span>{ROLE_LABEL[detail.itemRole]}</span>
                </p>
              </div>
              <span className={`${styles.statusBadge} ${BADGE_CLASS[bucket]}`}>{BADGE_LABEL[bucket]}</span>
            </div>

            <div className={styles.card}>
              <button
                type="button"
                className={styles.memberRow}
                onClick={() => navigate(`/adminHome/members/${detail.memberId}`)}
              >
                <span className={styles.rowLabel}>Member</span>
                <span className={styles.rowValueLink}>{detail.memberName}</span>
              </button>

              <DetailRow label="Member email" value={detail.memberEmail} />
              <DetailRow label="Requested" value={formatDate(detail.requestedAt)} />
              {detail.returnDate && <DetailRow label="Return date" value={formatCalendarDate(detail.returnDate)} />}
              {detail.reviewedAt && <DetailRow label="Checked out" value={formatDate(detail.reviewedAt)} />}
              {detail.reviewerName && <DetailRow label="Checked out by" value={detail.reviewerName} />}
              {detail.reviewNote && <DetailRow label="Note" value={detail.reviewNote} />}
            </div>

            {detail.otherItems.length > 0 && (
              <div className={styles.card}>
                <span className={styles.cardLabel}>Also included in this request</span>
                <ul className={styles.otherItemsList}>
                  {detail.otherItems.map((item) => (
                    <li key={item.itemName} className={styles.otherItem}>
                      <span>{item.itemName}</span>
                      <span className={styles.otherItemRole}>{ROLE_LABEL[item.itemRole]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(detail.signedAgreementPath || bucket === 'requests' || bucket === 'returns') && (
              <div className={styles.agreementRow}>
                <div className={styles.secondaryActions}>
                  {(bucket === 'requests' || bucket === 'returns') && (
                    <button
                      type="button"
                      className={styles.agreementButton}
                      onClick={() => setAvailabilityOpen(true)}
                    >
                      <CalendarIcon size={18} />
                      {bucket === 'requests' ? 'View checkout availability' : 'View return availability'}
                    </button>
                  )}
                  {detail.signedAgreementPath && (
                    <button
                      type="button"
                      className={styles.agreementButton}
                      onClick={() => void handleDownloadAgreement()}
                      disabled={isDownloading}
                    >
                      <DownloadIconFilled size={14} />
                      {isDownloading ? 'Opening…' : 'View signed agreement'}
                    </button>
                  )}
                </div>
                {downloadError && <p className={styles.inlineError}>{downloadError}</p>}
              </div>
            )}
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {isAvailabilityOpen && detail && (
        <AvailabilityModal
          loanRequestId={detail.loanRequestId}
          memberName={detail.memberName}
          requestedAt={detail.requestedAt}
          purpose={bucket === 'returns' ? 'return' : 'checkout'}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}
    </div>
  )
}
