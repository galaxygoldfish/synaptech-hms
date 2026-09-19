import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { fetchEquipment, fetchEquipmentByIds } from '../../lib/inventory'
import { submitLoanRequest, UnitUnavailableError, type SubmitLoanRequestItemInput } from '../../lib/loanRequests'
import type { Equipment, LoanRequestItemRole, UserProfile } from '../../types'
import { AvailabilityGrid, AvailabilityGridSkeleton, parseSlotKey } from './AvailabilityGrid'
import styles from './CheckoutAvailability.module.css'

interface CheckoutState {
  equipmentId: string
  optionalAddonIds: string[]
  requiredAddonId: string | null
  returnDates: Record<string, string>
  signedAgreements?: Record<string, File>
  signedNames?: Record<string, string>
  signedDates?: Record<string, string>
  unitIds?: Record<string, string | null>
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
    signedAgreements: value.signedAgreements,
    signedNames: value.signedNames,
    signedDates: value.signedDates,
    unitIds: value.unitIds,
  }
}

export default function CheckoutAvailability() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const checkoutState = useMemo(() => readCheckoutState(location.state), [location.state])

  useEffect(() => {
    if (!checkoutState) navigate('/home/checkout', { replace: true })
  }, [checkoutState, navigate])

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [items, setItems] = useState<Equipment[]>([])
  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!checkoutState) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    const addonIds = [
      ...checkoutState.optionalAddonIds,
      ...(checkoutState.requiredAddonId ? [checkoutState.requiredAddonId] : []),
    ]

    Promise.all([fetchEquipment(checkoutState.equipmentId), fetchEquipmentByIds(addonIds)])
      .then(([mainItem, addonItems]) => {
        if (!cancelled) setItems([mainItem, ...addonItems])
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load checkout items:', fetchError)
        if (!cancelled) setLoadError('Could not load your checkout items. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutState?.equipmentId])

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

  function roleForItem(itemId: string): LoanRequestItemRole {
    if (checkoutState?.requiredAddonId === itemId) return 'required_addon'
    if (checkoutState?.optionalAddonIds.includes(itemId)) return 'optional_addon'
    return 'primary'
  }

  async function handleSubmit() {
    if (!checkoutState || !profile || selected.size === 0 || items.length === 0) return
    setSubmitting(true)
    setSubmitError(null)

    const availability = [...selected].map(parseSlotKey)

    const requestItems: SubmitLoanRequestItemInput[] = items.map((item) => ({
      equipmentId: item.id,
      isHardware: item.product_type === 'hardware',
      role: roleForItem(item.id),
      returnDate: checkoutState.returnDates[item.id] ?? null,
      signedAgreementFile: checkoutState.signedAgreements?.[item.id] ?? null,
      signatureName: checkoutState.signedNames?.[item.id] ?? null,
      signatureDate: checkoutState.signedDates?.[item.id] ?? null,
      equipmentUnitId: checkoutState.unitIds?.[item.id] ?? null,
    }))

    try {
      await submitLoanRequest({ userId: profile.id, items: requestItems, availability })
      navigate('/home/checkout/success', { replace: true })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to submit checkout:', error)
      setSubmitError(
        error instanceof UnitUnavailableError
          ? 'Someone else just requested that hardware, so it is no longer available. Please go back to the start of checkout and try again.'
          : 'Could not submit your checkout request. Please try again.',
      )
      setSubmitting(false)
    }
  }

  if (!checkoutState) return null

  const canSubmit = selected.size > 0 && !isLoading && !loadError && !isSubmitting && items.length > 0

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <h1 className={styles.heading}>Add your pickup availability</h1>
        <p className={`${styles.subtext} ${styles.subtextHours}`}>
          Click all hours that you&rsquo;re available, even if only partially available during that hour
        </p>
        <p className={styles.subtext}>This information is collected to help our Hardware Managers schedule a pickup with you</p>

        {isLoading && (
          <div className={styles.card}>
            <AvailabilityGridSkeleton />
          </div>
        )}
        {!isLoading && loadError && <p className={styles.status}>{loadError}</p>}

        {!isLoading && !loadError && (
          <AvailabilityGrid selected={selected} onChange={setSelected} className={styles.card} />
        )}

        {submitError && <p className={styles.status}>{submitError}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
            back
          </button>
          <button type="button" className={styles.submitButton} onClick={handleSubmit} disabled={!canSubmit}>
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
