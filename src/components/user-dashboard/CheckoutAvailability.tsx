import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Header } from './Header'
import { ProfileModal } from './ProfileModal'
import { useEdgeFade } from '../../lib/useEdgeFade'
import { fetchEquipment, fetchEquipmentByIds } from '../../lib/inventory'
import { submitLoanRequest, type SubmitLoanRequestItemInput } from '../../lib/loanRequests'
import type { Equipment, LoanRequestItemRole, UserProfile } from '../../types'
import styles from './CheckoutAvailability.module.css'

const DAYS_COUNT = 14
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8) // 8:00 AM – 10:00 PM

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatDayLabel(date: Date): string {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
  const month = date.toLocaleDateString(undefined, { month: 'short' })
  return `${weekday} ${month} ${date.getDate()}`
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:00 ${period}`
}

interface CheckoutState {
  equipmentId: string
  optionalAddonIds: string[]
  requiredAddonId: string | null
  returnDates: Record<string, string>
  signedAgreements?: Record<string, File>
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

  const { ref: fadeRef, maskImage } = useEdgeFade<HTMLDivElement>()

  // Mouse-only drag-select bookkeeping. Touch input is left untouched so the
  // native horizontal swipe-to-scroll gesture over the table keeps working —
  // touch users toggle slots with a plain tap via onClick instead.
  const isMouseDownRef = useRef(false)
  const didDragRef = useRef(false)
  const dragModeRef = useRef<'select' | 'deselect' | null>(null)
  const lastPaintedKeyRef = useRef<string | null>(null)

  const days = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: DAYS_COUNT }, (_, i) => new Date(today.getTime() + i * ONE_DAY_MS))
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

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  function paintKey(key: string) {
    setSelected((current) => {
      if (dragModeRef.current === null) {
        dragModeRef.current = current.has(key) ? 'deselect' : 'select'
      }
      if (lastPaintedKeyRef.current === key) return current
      lastPaintedKeyRef.current = key
      const next = new Set(current)
      if (dragModeRef.current === 'select') next.add(key)
      else next.delete(key)
      return next
    })
  }

  function handleWindowPointerMove(event: PointerEvent) {
    if (!isMouseDownRef.current) return
    didDragRef.current = true
    const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const key = el?.closest<HTMLElement>('[data-slot-key]')?.dataset.slotKey
    if (key) paintKey(key)
  }

  function handleWindowPointerUp() {
    isMouseDownRef.current = false
    dragModeRef.current = null
    lastPaintedKeyRef.current = null
    window.removeEventListener('pointermove', handleWindowPointerMove)
    window.removeEventListener('pointerup', handleWindowPointerUp)
  }

  function handleSlotPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'mouse') return
    event.preventDefault()
    isMouseDownRef.current = true
    didDragRef.current = false
    dragModeRef.current = null
    lastPaintedKeyRef.current = null
    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)
  }

  function handleSlotClick(key: string) {
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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

    const availability = Array.from(selected).map((key) => {
      const [date, hourText] = key.split('|')
      return { date, hour: Number(hourText) }
    })

    const requestItems: SubmitLoanRequestItemInput[] = items.map((item) => ({
      equipmentId: item.id,
      isHardware: item.product_type === 'hardware',
      role: roleForItem(item.id),
      returnDate: checkoutState.returnDates[item.id] ?? null,
      signedAgreementFile: checkoutState.signedAgreements?.[item.id] ?? null,
    }))

    try {
      await submitLoanRequest({ userId: profile.id, items: requestItems, availability })
      navigate('/home/checkout/success', { replace: true })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to submit checkout:', error)
      setSubmitError('Could not submit your checkout request. Please try again.')
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
        <p className={styles.subtext}>You must enter your availability for the next two weeks in the table below</p>
        <p className={styles.subtext}>Click all hours that you&rsquo;re available, even if only partially available during that hour</p>
        <p className={styles.subtext}>This information is collected to help our Hardware Managers schedule a pickup with you</p>

        {isLoading && <p className={styles.status}>Loading…</p>}
        {!isLoading && loadError && <p className={styles.status}>{loadError}</p>}

        {!isLoading && !loadError && (
          <div className={styles.card}>
            <div ref={fadeRef} className={styles.tableScroll} style={{ WebkitMaskImage: maskImage, maskImage }}>
              {days.map((date) => {
                const dateISO = toISODate(date)
                return (
                  <div key={dateISO} className={styles.dayColumn}>
                    <p className={styles.dayLabel}>{formatDayLabel(date)}</p>
                    <div className={styles.slotList}>
                      {HOURS.map((hour) => {
                        const key = `${dateISO}|${hour}`
                        const isSelected = selected.has(key)
                        return (
                          <button
                            key={key}
                            type="button"
                            data-slot-key={key}
                            className={isSelected ? `${styles.slot} ${styles.slotSelected}` : styles.slot}
                            aria-pressed={isSelected}
                            onPointerDown={handleSlotPointerDown}
                            onClick={() => handleSlotClick(key)}
                          >
                            {formatHourLabel(hour)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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
