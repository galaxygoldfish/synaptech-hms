import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AgreementPreview } from './AgreementPreview'
import { canExtend, fetchMemberLoanItem, requestExtension, type MemberLoanItem } from '../../lib/memberLoans'
import { fetchEquipmentByIds } from '../../lib/inventory'
import { buildLoanAgreementPdf, preloadAgreementPdfLib } from '../../lib/loanAgreementPdf'
import { extensionWindow, toISODate } from '../../lib/quarters'
import type { UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import signStyles from './CheckoutSignAgreement.module.css'
import styles from './ExtendLoan.module.css'

/** Shown to the member here and to admins on the request. Not enforced. */
export const EXTENSION_GROUP_NOTICE = 'Extensions are only for loans for project groups.'

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(value: number | null | undefined): string {
  return value == null ? 'N/A' : `$${value.toFixed(2)}`
}

function dayAfter(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return toISODate(date)
}

/**
 * "Extend a loan": the member picks a new return date in the next quarter
 * and re-signs the loan agreement with it — the same agreement, preview and
 * PDF as the checkout signing step, with only the return date changed. An
 * admin approves it from the loan detail screen; until then nothing about
 * the loan changes.
 */
export default function ExtendLoan() {
  useEffect(preloadAgreementPdfLib, [])

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [item, setItem] = useState<MemberLoanItem | null>(null)
  const [replacementValue, setReplacementValue] = useState<number | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [newDate, setNewDate] = useState('')
  const [signatureName, setSignatureName] = useState('')
  const [signatureDate, setSignatureDate] = useState(() => toISODate(new Date()))
  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    fetchMemberLoanItem(id)
      .then(async (loan) => {
        const [equipment] = await fetchEquipmentByIds([loan.equipmentId])
        if (cancelled) return
        setItem(loan)
        setReplacementValue(equipment?.replacement_value ?? null)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the loan to extend:', fetchError)
        if (!cancelled) setLoadError('Could not load this loan. Please try again.')
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

  const quarterWindow = extensionWindow(new Date())
  const today = toISODate(new Date())
  const minDate = item?.returnDate ? dayAfter(item.returnDate > today ? item.returnDate : today) : dayAfter(today)
  const maxDate = quarterWindow?.maxDate ?? minDate
  const isDateValid = Boolean(newDate) && newDate >= minDate && newDate <= maxDate

  const canSubmit = Boolean(item && profile && isDateValid && signatureName.trim() && signatureDate) && !isSubmitting

  async function handleSubmit() {
    if (!canSubmit || !item || !profile) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const pdf = await buildLoanAgreementPdf({
        fullName: `${profile.first_name} ${profile.last_name}`,
        studentId: profile.student_id,
        studentEmail: profile.uw_email,
        phone: profile.phone,
        address: profile.address,
        productName: item.itemName,
        serialNumber: item.serialNumber ?? 'TBD',
        loanDate: formatDate(toISODate(new Date(item.reviewedAt ?? item.requestedAt))),
        returnDate: formatDate(newDate),
        replacementValue: formatCurrency(replacementValue),
        signatureName: signatureName.trim(),
        signatureDate: formatDate(signatureDate),
      })
      const blob = pdf.output('blob') as Blob
      const file = new File([blob], 'loan-extension-agreement.pdf', { type: 'application/pdf' })
      await requestExtension({
        item,
        userId: profile.id,
        newReturnDate: newDate,
        agreementFile: file,
        signatureName: signatureName.trim(),
        signatureDate,
      })
      navigate(`/home/loans/${item.id}`, { replace: true })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to request an extension:', error)
      setSubmitError('Could not submit your extension. Please try again.')
      setSubmitting(false)
    }
  }

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  if (!isLoading && item && !canExtend(item)) {
    return <Navigate to={`/home/loans/${item.id}`} replace />
  }

  return (
    <div className={signStyles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={signStyles.main}>
        <h1 className={signStyles.heading}>Extend your loan</h1>
        <p className={signStyles.subtext}>
          Pick a new return date, then re-sign the Hardware Loan Agreement with it. A Hardware Manager reviews the
          request before your due date changes.
        </p>

        {isLoading && (
          <SkeletonScreen label="Loading your loan…">
            <Skeleton width="100%" height="6rem" radius="0.75rem" />
          </SkeletonScreen>
        )}
        {!isLoading && loadError && <p className={signStyles.status}>{loadError}</p>}

        {!isLoading && !loadError && item && profile && (
          <>
            <p className={styles.notice} role="note">
              {EXTENSION_GROUP_NOTICE}
            </p>

            <div className={styles.dateCard}>
              <div className={styles.dateField}>
                <span className={styles.dateLabel}>Currently due</span>
                <span className={styles.dateValue}>{item.returnDate ? formatDate(item.returnDate) : '—'}</span>
              </div>
              <label className={styles.dateField}>
                <span className={styles.dateLabel}>New return date (by {formatDate(maxDate)})</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={newDate}
                  min={minDate}
                  max={maxDate}
                  onChange={(event) => setNewDate(event.target.value)}
                />
              </label>
            </div>

            <AgreementPreview
              fullName={`${profile.first_name} ${profile.last_name}`}
              studentId={profile.student_id}
              studentEmail={profile.uw_email}
              phone={profile.phone}
              address={profile.address}
              productName={item.itemName}
              serialNumber={item.serialNumber ?? 'TBD'}
              loanDate={formatDate(toISODate(new Date(item.reviewedAt ?? item.requestedAt)))}
              returnDate={newDate ? formatDate(newDate) : 'TBD'}
              replacementValue={formatCurrency(replacementValue)}
              signatureName={signatureName}
              signatureDate={signatureDate}
              onSignatureNameChange={setSignatureName}
              onSignatureDateChange={setSignatureDate}
            />

            {submitError && (
              <p className={styles.error} role="alert">
                {submitError}
              </p>
            )}
          </>
        )}

        <div className={signStyles.actions}>
          <button type="button" className={signStyles.backButton} onClick={() => navigate(-1)}>
            back
          </button>
          <button
            type="button"
            className={signStyles.submitButton}
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {isSubmitting ? 'submitting…' : 'request extension'}
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
