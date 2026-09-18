import { useEffect, useMemo, useState } from 'react'
import { useEdgeFade, useVerticalEdgeFade } from '../../lib/useEdgeFade'
import { fetchLoanRequestAvailability, type AvailabilitySlot } from '../../lib/loanRequests'
import { CloseIcon } from './icons'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './AvailabilityModal.module.css'

interface AvailabilityModalProps {
  loanRequestId: string
  memberName: string
  requestedAt: string
  purpose: 'checkout' | 'return'
  onClose: () => void
}

// Same 14-day/8am-10pm window CheckoutAvailability.tsx shows the member —
// the window starts the day they submitted the request.
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

export function AvailabilityModal({ loanRequestId, memberName, requestedAt, purpose, onClose }: AvailabilityModalProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { ref: hFadeRef, maskImage: hMaskImage } = useEdgeFade<HTMLDivElement>()
  const { ref: vFadeRef, maskImage: vMaskImage } = useVerticalEdgeFade<HTMLDivElement>()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLoanRequestAvailability(loanRequestId)
      .then((data) => {
        if (!cancelled) setSlots(data)
      })
      .catch((fetchError) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load availability:', fetchError)
        if (!cancelled) setError('Could not load availability. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loanRequestId])

  const selectedByDate = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const slot of slots) {
      const hours = map.get(slot.date) ?? new Set<number>()
      hours.add(slot.hour)
      map.set(slot.date, hours)
    }
    return map
  }, [slots])

  const days = useMemo(() => {
    const start = new Date(requestedAt)
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: DAYS_COUNT }, (_, i) => new Date(start.getTime() + i * ONE_DAY_MS))
  }, [requestedAt])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.heading}>
              {purpose === 'checkout' ? 'Checkout availability' : 'Return availability'}
            </h2>
            <p className={styles.subheading}>
              {memberName}&rsquo;s submitted {purpose === 'checkout' ? 'checkout' : 'return'} availability
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        {isLoading && (
          <SkeletonScreen label="Loading availability…">
            <div className={styles.tableWrap}>
              <div className={styles.tableScroll}>
                {Array.from({ length: 5 }, (_, dayIndex) => (
                  <div key={dayIndex} className={styles.dayColumn}>
                    <p className={styles.dayLabel}>
                      <Skeleton width="4.5rem" height="0.9375rem" shape="pill" style={{ margin: '0 auto' }} />
                    </p>
                    <div className={styles.slotList}>
                      {Array.from({ length: 8 }, (_, slotIndex) => (
                        <Skeleton key={slotIndex} height="2rem" radius="0.625rem" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SkeletonScreen>
        )}
        {!isLoading && error && <p className={styles.status}>{error}</p>}
        {!isLoading && !error && slots.length === 0 && (
          <p className={styles.status}>No availability was submitted with this request.</p>
        )}

        {!isLoading && !error && slots.length > 0 && (
          <>
            <div className={styles.legend}>
              <span className={`${styles.legendSwatch} ${styles.slotSelected}`} />
              Available
            </div>
            <div className={styles.tableWrap} style={{ WebkitMaskImage: vMaskImage, maskImage: vMaskImage }}>
              <div
                // One element, both axes — each hook keeps its own fade
                // state for the edge it owns.
                ref={(el) => {
                  hFadeRef(el)
                  vFadeRef(el)
                }}
                className={styles.tableScroll}
                style={{ WebkitMaskImage: hMaskImage, maskImage: hMaskImage }}
              >
                {days.map((date) => {
                  const dateISO = toISODate(date)
                  const hours = selectedByDate.get(dateISO) ?? new Set<number>()
                  return (
                    <div key={dateISO} className={styles.dayColumn}>
                      <p className={styles.dayLabel}>{formatDayLabel(date)}</p>
                      <div className={styles.slotList}>
                        {HOURS.map((hour) => {
                          const isSelected = hours.has(hour)
                          return (
                            <span
                              key={hour}
                              className={isSelected ? `${styles.slot} ${styles.slotSelected}` : styles.slot}
                            >
                              {formatHourLabel(hour)}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
