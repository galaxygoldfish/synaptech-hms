import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AgreementPreview } from '../user-dashboard/AgreementPreview'
import { ArrowLeftIcon, ImagePlaceholderIconFilled } from './icons'
import {
  fetchLoanRequestItemDetail,
  handOffLoanRequestItem,
  type AdminLoanRequestDetail,
} from '../../lib/loanRequests'
import { fetchEquipment } from '../../lib/inventory'
import { fetchProfileById } from '../../lib/members'
import type { Equipment } from '../../types'
import type { Profile } from '../../types/index'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './HandOffAgreement.module.css'

/**
 * Signing off a loan agreement and recording the hand-off — the last step of
 * both routes an admin can take to put hardware in someone's hands: the
 * "Mark as handed off" button on a loan, and "Check out hardware" off the
 * dashboard. The two differ only in how they got here and where they go
 * next, so they pass that in and share everything else.
 *
 * Splitting it this way is the same argument handOffLoanRequestItem makes
 * for itself one layer down: the screen where an admin attests to an
 * agreement must not mean something subtly different depending on which
 * button they pressed to reach it.
 */

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimestampDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatCurrency(value: number | null): string {
  return value == null ? 'N/A' : `$${value.toFixed(2)}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function nowTime(): string {
  return new Date().toTimeString().slice(0, 5)
}

/**
 * Combines the date and time the admin typed into one instant, for the
 * certificate. Falls back to now if either is missing or unparseable — the
 * hand-off is still real, it just gets stamped with the moment it was
 * recorded.
 */
function attestedAt(date: string, time: string): Date {
  const parsed = new Date(`${date}T${time || '00:00'}`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export interface LoanAgreementSignOffProps {
  /** loan_request_items.id of the item being handed over. */
  itemId: string
  heading: string
  subtext: string
  /** Where the back button and the "back" action below the agreement go. */
  onBack: () => void
  /** Called once the hand-off is recorded, with the loan it was recorded for. */
  onRecorded: (detail: AdminLoanRequestDetail) => void
}

export function LoanAgreementSignOff({
  itemId,
  heading,
  subtext,
  onBack,
  onRecorded,
}: LoanAgreementSignOffProps) {
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [detail, setDetail] = useState<AdminLoanRequestDetail | null>(null)
  const [member, setMember] = useState<Profile | null>(null)
  const [equipment, setEquipment] = useState<Equipment | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [receivedDate, setReceivedDate] = useState(todayIso)
  const [receivedTime, setReceivedTime] = useState(nowTime)
  // Deliberately blank: typing it is the attestation, the same way the
  // borrower types theirs in section 9 rather than having it filled in.
  const [managerName, setManagerName] = useState('')

  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLoanRequestItemDetail(itemId)
      .then(async (loan) => {
        // The agreement needs more of the borrower and the product than the
        // loan record carries — their student ID, phone and address, and the
        // product's replacement value, all of which are printed on it.
        const [memberProfile, equipmentRow] = await Promise.all([
          fetchProfileById(loan.memberId),
          fetchEquipment(loan.equipmentId),
        ])
        if (cancelled) return
        setDetail(loan)
        setMember(memberProfile)
        setEquipment(equipmentRow)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the hand-off:', fetchError)
        if (!cancelled) setError('Could not load this loan. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [itemId])

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

  const canSubmit = Boolean(managerName.trim() && receivedDate && detail && profile && !isSubmitting)

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  async function handleHandOff() {
    if (!detail || !profile || !canSubmit) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      await handOffLoanRequestItem({
        itemId: detail.id,
        adminId: profile.id,
        // The typed name, not the signed-in account's — section 10 asks who
        // physically received and handed over the hardware, and that's what
        // goes on the certificate.
        adminName: managerName.trim(),
        attestedAt: attestedAt(receivedDate, receivedTime),
      })
      onRecorded(detail)
    } catch (handOffError) {
      // eslint-disable-next-line no-console
      console.error('Failed to record the hand-off:', handOffError)
      setSubmitError('Could not record the hand-off. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <div className={styles.topRow}>
          <button type="button" className={styles.backButton} onClick={onBack} aria-label="Back">
            <ArrowLeftIcon size={20} />
            <span>Back</span>
          </button>
          <h1 className={styles.heading}>{heading}</h1>
          <div />
        </div>

        <p className={styles.subtext}>{subtext}</p>

        {isLoading && (
          <SkeletonScreen label="Loading the agreement…" className={styles.skeletonStack}>
            <div className={styles.summaryCard}>
              <Skeleton width="14rem" height="1.5rem" shape="pill" />
              <Skeleton width="9rem" height="1.125rem" shape="pill" />
            </div>
            <div className={styles.agreementSkeleton}>
              <Skeleton width="60%" height="1.75rem" shape="pill" />
              {Array.from({ length: 9 }, (_, index) => (
                <Skeleton key={index} height="1rem" shape="pill" width={index % 3 === 2 ? '70%' : '100%'} />
              ))}
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && detail && member && equipment && (
          <>
            <div className={styles.summaryCard}>
              {/* Same fixed slot as the loan detail's sibling rows, so a
                  product without a photo doesn't pull the text left. */}
              {detail.imageUrl ? (
                <img src={detail.imageUrl} alt="" className={styles.summaryThumb} />
              ) : (
                <span className={styles.summaryThumbEmpty}>
                  <ImagePlaceholderIconFilled size={24} />
                </span>
              )}
              <div className={styles.summaryText}>
                <p className={styles.summaryName}>{detail.itemName}</p>
                <p className={styles.summaryMeta}>
                  {detail.serialNumber ?? 'No serial assigned'} · handing to {detail.memberName}
                </p>
              </div>
            </div>

            <div className={styles.agreementWrap}>
              <AgreementPreview
                mode="review"
                fullName={`${member.first_name} ${member.last_name}`}
                studentId={member.student_id}
                studentEmail={member.uw_email}
                phone={member.phone}
                address={member.address}
                productName={detail.itemName}
                serialNumber={detail.serialNumber ?? 'Not assigned'}
                loanDate={formatTimestampDate(detail.requestedAt)}
                returnDate={detail.returnDate ? formatDate(detail.returnDate) : 'TBD'}
                replacementValue={formatCurrency(equipment.replacement_value)}
                // Section 9 exactly as the borrower filled it in. Items
                // submitted before signatures were stored have neither, and
                // the fields say so rather than guessing from the profile.
                signatureName={detail.signatureName ?? ''}
                signatureDate={detail.signatureDate ? formatDate(detail.signatureDate) : ''}
                internalUse={{
                  receivedDate,
                  receivedTime,
                  managerName,
                  onReceivedDateChange: setReceivedDate,
                  onReceivedTimeChange: setReceivedTime,
                  onManagerNameChange: setManagerName,
                }}
              />
            </div>

            {submitError && <p className={styles.inlineError}>{submitError}</p>}

            <div className={styles.actions}>
              <button type="button" className={styles.backActionButton} onClick={onBack}>
                back
              </button>
              <button
                type="button"
                className={styles.submitButton}
                onClick={() => void handleHandOff()}
                disabled={!canSubmit}
              >
                {isSubmitting ? 'recording…' : 'next'}
              </button>
            </div>
          </>
        )}
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
