import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { AgreementPreview } from './AgreementPreview'
import { CheckmarkIcon } from './icons'
import { fetchAvailableSerialNumber, fetchEquipment, fetchEquipmentByIds } from '../../lib/inventory'
import { buildLoanAgreementPdf } from '../../lib/loanAgreementPdf'
import type { Equipment, UserProfile } from '../../types'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './CheckoutSignAgreement.module.css'

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(value: number | null): string {
  return value == null ? 'N/A' : `$${value.toFixed(2)}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface CheckoutState {
  equipmentId: string
  optionalAddonIds: string[]
  requiredAddonId: string | null
  returnDates: Record<string, string>
}

function readCheckoutState(state: unknown): CheckoutState | null {
  if (!state || typeof state !== 'object') return null
  const value = state as Partial<CheckoutState>
  if (typeof value.equipmentId !== 'string' || !value.returnDates) return null
  return {
    equipmentId: value.equipmentId,
    optionalAddonIds: Array.isArray(value.optionalAddonIds) ? value.optionalAddonIds : [],
    requiredAddonId: typeof value.requiredAddonId === 'string' ? value.requiredAddonId : null,
    returnDates: value.returnDates,
  }
}

interface SignatureEntry {
  name: string
  date: string
}

export default function CheckoutSignAgreement() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const checkoutState = readCheckoutState(location.state)

  const [items, setItems] = useState<Equipment[]>([])
  const [serials, setSerials] = useState<Record<string, string | null>>({})
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<Record<string, SignatureEntry>>({})
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!checkoutState) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const addonIds = [
      ...checkoutState.optionalAddonIds,
      ...(checkoutState.requiredAddonId ? [checkoutState.requiredAddonId] : []),
    ]

    Promise.all([fetchEquipment(checkoutState.equipmentId), fetchEquipmentByIds(addonIds)])
      .then(async ([mainItem, addonItems]) => {
        if (cancelled) return
        const allItems = [mainItem, ...addonItems]
        setItems(allItems)

        const hardwareItems = allItems.filter((item) => item.product_type === 'hardware')
        const serialEntries = await Promise.all(
          hardwareItems.map(async (item) => [item.id, await fetchAvailableSerialNumber(item.id)] as const),
        )
        if (!cancelled) setSerials(Object.fromEntries(serialEntries))
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load checkout items:', fetchError)
        if (!cancelled) setError('Could not load your checkout items. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutState?.equipmentId])

  useEffect(() => {
    if (!checkoutState) navigate('/home/checkout', { replace: true })
  }, [checkoutState, navigate])

  const hardwareItems = useMemo(() => items.filter((item) => item.product_type === 'hardware'), [items])
  const consumableItems = useMemo(() => items.filter((item) => item.product_type !== 'hardware'), [items])

  // Seed a blank signature entry (today's date, but no name — the
  // borrower must type their own signature) for any hardware item that
  // doesn't have one yet, and make sure a tab is always selected once
  // items are available.
  useEffect(() => {
    if (hardwareItems.length === 0) return
    setSignatures((current) => {
      let changed = false
      const next = { ...current }
      for (const item of hardwareItems) {
        if (!next[item.id]) {
          next[item.id] = { name: '', date: todayIso() }
          changed = true
        }
      }
      return changed ? next : current
    })
    setActiveItemId((current) => (current && hardwareItems.some((item) => item.id === current) ? current : hardwareItems[0].id))
  }, [hardwareItems])

  const canSubmit =
    !isLoading &&
    !error &&
    !isSubmitting &&
    hardwareItems.length > 0 &&
    hardwareItems.every((item) => {
      const entry = signatures[item.id]
      return Boolean(entry && entry.name.trim() && entry.date)
    })

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null
    return {
      name:     `${profile.first_name} ${profile.last_name}`,
      role:     profile.role === 'admin' ? 'ADMINISTRATOR' : 'MEMBER',
      email:    profile.uw_email,
      handle:   profile.discord,
      location: profile.address,
    }
  }, [profile])

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function updateSignature(itemId: string, patch: Partial<SignatureEntry>) {
    setSignatures((current) => ({
      ...current,
      [itemId]: { ...current[itemId], ...patch } as SignatureEntry,
    }))
  }

  async function handleNext() {
    if (!canSubmit || !checkoutState || !profile) return
    setSubmitting(true)
    setError(null)
    try {
      const entries = await Promise.all(
        hardwareItems.map(async (item) => {
          const signature = signatures[item.id]
          const returnDateIso = checkoutState.returnDates[item.id]
          const pdf = await buildLoanAgreementPdf({
            fullName: `${profile.first_name} ${profile.last_name}`,
            studentId: profile.student_id,
            studentEmail: profile.uw_email,
            phone: profile.phone,
            address: profile.address,
            productName: item.name,
            serialNumber: serials[item.id] ?? 'TBD',
            loanDate: formatDate(todayIso()),
            returnDate: returnDateIso ? formatDate(returnDateIso) : 'TBD',
            replacementValue: formatCurrency(item.replacement_value),
            signatureName: signature.name.trim(),
            signatureDate: formatDate(signature.date),
          })
          const blob = pdf.output('blob') as Blob
          const file = new File([blob], `${slugify(item.name)}-loan-agreement.pdf`, { type: 'application/pdf' })
          return [item.id, file] as const
        }),
      )
      const signedAgreements = Object.fromEntries(entries)
      navigate('/home/checkout/availability', {
        state: { ...checkoutState, signedAgreements },
      })
    } catch (submitError) {
      // eslint-disable-next-line no-console
      console.error('Failed to prepare signed loan agreements:', submitError)
      setError('Could not prepare your signed agreement. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!checkoutState) return null

  const activeItem = hardwareItems.find((item) => item.id === activeItemId) ?? hardwareItems[0] ?? null
  const activeSignature = activeItem ? signatures[activeItem.id] : null

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <h1 className={styles.heading}>Sign the Hardware Loan Agreement</h1>
        <p className={styles.subtext}>Review the agreement below, then type your name and the date to sign electronically</p>

        {isLoading && (
          <SkeletonScreen label="Loading your checkout items…">
            <div className={styles.card}>
              <p className={styles.cardTitle}>Items to be checked out</p>
              <ul className={styles.itemList}>
                {Array.from({ length: 2 }, (_, index) => (
                  <li key={index} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <Skeleton width="45%" height="1.375rem" shape="pill" />
                      <Skeleton width="60%" height="1.0625rem" shape="pill" />
                    </div>
                    <Skeleton width="10rem" height="3rem" radius="0.9375rem" />
                  </li>
                ))}
              </ul>
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && activeItem && activeSignature && profile && (
          <>
            {hardwareItems.length > 1 && (
              <div className={styles.tabRow}>
                {hardwareItems.map((item) => {
                  const isActive = item.id === activeItem.id
                  const isSigned = Boolean(signatures[item.id]?.name.trim() && signatures[item.id]?.date)
                  const tabClassName = [
                    styles.tab,
                    isSigned ? styles.tabComplete : styles.tabIncomplete,
                    isActive ? styles.tabActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={tabClassName}
                      onClick={() => setActiveItemId(item.id)}
                      aria-pressed={isActive}
                    >
                      {item.name}
                      {isSigned && <CheckmarkIcon size={14} className={styles.tabCheckmark} />}
                    </button>
                  )
                })}
              </div>
            )}

            <AgreementPreview
              fullName={`${profile.first_name} ${profile.last_name}`}
              studentId={profile.student_id}
              studentEmail={profile.uw_email}
              phone={profile.phone}
              address={profile.address}
              productName={activeItem.name}
              serialNumber={serials[activeItem.id] ?? 'TBD'}
              loanDate={formatDate(todayIso())}
              returnDate={
                checkoutState.returnDates[activeItem.id] ? formatDate(checkoutState.returnDates[activeItem.id]) : 'TBD'
              }
              replacementValue={formatCurrency(activeItem.replacement_value)}
              signatureName={activeSignature.name}
              signatureDate={activeSignature.date}
              onSignatureNameChange={(value) => updateSignature(activeItem.id, { name: value })}
              onSignatureDateChange={(value) => updateSignature(activeItem.id, { date: value })}
            />

            {consumableItems.length > 0 && (
              <p className={styles.consumableNote}>
                {consumableItems.map((item) => item.name).join(', ')}{' '}
                {consumableItems.length === 1 ? "doesn't" : "don't"} need a signature — consumable item
                {consumableItems.length === 1 ? '' : 's'}.
              </p>
            )}
          </>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
            back
          </button>
          <button type="button" className={styles.submitButton} onClick={() => void handleNext()} disabled={!canSubmit}>
            {isSubmitting ? 'preparing…' : 'next'}
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
