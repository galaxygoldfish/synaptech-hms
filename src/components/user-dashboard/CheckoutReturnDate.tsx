import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { CalendarIcon } from './icons'
import { fetchEquipment, fetchEquipmentByIds } from '../../lib/inventory'
import type { Equipment, UserProfile } from '../../types'
import styles from './CheckoutReturnDate.module.css'

// The Synaptech Hardware Checkout & Usage Policy Google Doc.
const POLICY_URL = 'https://docs.google.com/document/d/11RSFuvvg1F4aM9V0znWw7wFn_MZMx95T7EdlblAyPfc/edit?tab=t.0'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_LOAN_DAYS = 90 // "one quarter"

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface CheckoutState {
  equipmentId: string
  optionalAddonIds: string[]
  requiredAddonId: string | null
}

function readCheckoutState(state: unknown): CheckoutState | null {
  if (!state || typeof state !== 'object') return null
  const value = state as Partial<CheckoutState>
  if (typeof value.equipmentId !== 'string') return null
  return {
    equipmentId: value.equipmentId,
    optionalAddonIds: Array.isArray(value.optionalAddonIds) ? value.optionalAddonIds : [],
    requiredAddonId: typeof value.requiredAddonId === 'string' ? value.requiredAddonId : null,
  }
}

interface DateSelectButtonProps {
  value: string
  onChange: (value: string) => void
  min: string
  max: string
}

function DateSelectButton({ value, onChange, min, max }: DateSelectButtonProps) {
  return (
    <label className={styles.dateButton}>
      <CalendarIcon size={22} className={styles.dateButtonIcon} />
      <span className={value ? styles.dateButtonValue : styles.dateButtonPlaceholder}>
        {value ? formatDate(value) : 'Select'}
      </span>
      <input
        type="date"
        className={styles.dateInput}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Select return date"
      />
    </label>
  )
}

export default function CheckoutReturnDate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const checkoutState = readCheckoutState(location.state)

  const [items, setItems] = useState<Equipment[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({})

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
      .then(([mainItem, addonItems]) => {
        if (!cancelled) setItems([mainItem, ...addonItems])
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

  const { minDate, maxDate } = useMemo(() => {
    const today = new Date()
    return {
      minDate: toISODate(new Date(today.getTime() + ONE_DAY_MS)),
      maxDate: toISODate(new Date(today.getTime() + MAX_LOAN_DAYS * ONE_DAY_MS)),
    }
  }, [])

  const hardwareItems = useMemo(() => items.filter((item) => item.product_type === 'hardware'), [items])
  const canConfirm =
    !isLoading && !error && items.length > 0 && hardwareItems.every((item) => Boolean(selectedDates[item.id]))

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

  function handleConfirm() {
    if (!canConfirm || !checkoutState) return
    navigate('/home/checkout/sign-agreement', {
      state: { ...checkoutState, returnDates: selectedDates },
    })
  }

  if (!checkoutState) return null

  return (
    <div className={styles.page}>
      <Header userName={user?.name.split(' ')[0] ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <main className={styles.main}>
        <h1 className={styles.heading}>Choose your return date</h1>
        <p className={styles.subtext}>You must select a return date for each hardware product that you check out</p>
        <p className={styles.subtext}>
          The maximum loan period is one quarter, which can be extended prior to the item return date as desired
        </p>

        {isLoading && <p className={styles.status}>Loading…</p>}
        {!isLoading && error && <p className={styles.status}>{error}</p>}

        {!isLoading && !error && items.length > 0 && (
          <div className={styles.card}>
            <p className={styles.cardTitle}>Items to be checked out</p>
            <ul className={styles.itemList}>
              {items.map((item) => {
                const needsReturn = item.product_type === 'hardware'
                return (
                  <li key={item.id} className={styles.itemRow}>
                    {item.image_url && <img src={item.image_url} alt="" className={styles.itemThumb} />}
                    <div className={styles.itemInfo}>
                      <p className={styles.itemName}>{item.name}</p>
                      {item.description && <p className={styles.itemDescription}>{item.description}</p>}
                    </div>
                    {needsReturn ? (
                      <DateSelectButton
                        value={selectedDates[item.id] ?? ''}
                        onChange={(value) => setSelectedDates((current) => ({ ...current, [item.id]: value }))}
                        min={minDate}
                        max={maxDate}
                      />
                    ) : (
                      <p className={styles.returnNotRequired}>Return not required</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <p className={styles.policyText}>
          Be sure to consult the{' '}
          <a href={POLICY_URL} target="_blank" rel="noopener noreferrer" className={styles.policyLink}>
            Synaptech Hardware Checkout &amp; Usage Policy
          </a>{' '}
          for more information on the return date and loan period
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
            back
          </button>
          <button type="button" className={styles.confirmButton} onClick={handleConfirm} disabled={!canConfirm}>
            confirm
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}
    </div>
  )
}
