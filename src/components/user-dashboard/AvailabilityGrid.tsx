import { useMemo, useRef } from 'react'
import { useEdgeFade } from '../../lib/useEdgeFade'
import { Skeleton, SkeletonScreen } from '../skeleton/Skeleton'
import styles from './AvailabilityGrid.module.css'

/**
 * The fourteen-day, 8am–10pm grid a member paints their free hours onto.
 *
 * One implementation for all four places it appears: submitting a checkout,
 * requesting a return, and editing either afterwards. They ask the same
 * question and a slot has to mean the same thing in each — the admin reading
 * the answer in AvailabilityModal is looking at one grid, not four.
 *
 * Mouse drag paints a run of hours; touch is deliberately left to plain taps
 * so the native horizontal swipe still scrolls the table.
 */

export const AVAILABILITY_DAYS = 14
/** 8:00 AM through 10:00 PM. */
export const AVAILABILITY_HOURS = Array.from({ length: 15 }, (_, index) => index + 8)

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `${ISO date}|${hour}` — the shape the selection set is keyed by. */
export function slotKey(date: string, hour: number): string {
  return `${date}|${hour}`
}

export function parseSlotKey(key: string): { date: string; hour: number } {
  const [date, hour] = key.split('|')
  return { date, hour: Number(hour) }
}

/** The fourteen days the grid covers, starting today. */
export function availabilityDays(from: Date = new Date()): Date[] {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  return Array.from(
    { length: AVAILABILITY_DAYS },
    (_, index) => new Date(start.getTime() + index * ONE_DAY_MS),
  )
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

interface AvailabilityGridProps {
  /** Selected slots, keyed by `slotKey`. */
  selected: Set<string>
  onChange: (next: Set<string>) => void
  /** Day the fourteen-day window opens on. Defaults to today. */
  from?: Date
  /** Wraps the grid in the bordered card the full-page screens use. */
  framed?: boolean
  className?: string
}

export function AvailabilityGridSkeleton({ days = 6, slots = 9 }: { days?: number; slots?: number }) {
  return (
    <SkeletonScreen label="Loading the availability grid…">
      <div className={styles.tableScroll}>
        {Array.from({ length: days }, (_, dayIndex) => (
          <div key={dayIndex} className={styles.dayColumn}>
            <p className={styles.dayLabel}>
              <Skeleton width="4.5rem" height="0.9375rem" shape="pill" style={{ margin: '0 auto' }} />
            </p>
            <div className={styles.slotList}>
              {Array.from({ length: slots }, (_, slotIndex) => (
                <Skeleton key={slotIndex} height="2.25rem" radius="0.625rem" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonScreen>
  )
}

export function AvailabilityGrid({
  selected,
  onChange,
  from,
  framed = true,
  className,
}: AvailabilityGridProps) {
  const { ref: fadeRef, maskImage } = useEdgeFade<HTMLDivElement>()

  // Mouse-only drag-select bookkeeping. Touch input is left untouched so the
  // native horizontal swipe-to-scroll gesture over the table keeps working —
  // touch users toggle slots with a plain tap via onClick instead.
  const isMouseDownRef = useRef(false)
  const didDragRef = useRef(false)
  const dragModeRef = useRef<'select' | 'deselect' | null>(null)
  const lastPaintedKeyRef = useRef<string | null>(null)
  // The latest selection, for the window listeners — they are registered once
  // per drag and would otherwise paint onto whatever set existed then.
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const days = useMemo(() => availabilityDays(from), [from])

  function paintKey(key: string) {
    const current = selectedRef.current
    if (dragModeRef.current === null) {
      dragModeRef.current = current.has(key) ? 'deselect' : 'select'
    }
    if (lastPaintedKeyRef.current === key) return
    lastPaintedKeyRef.current = key

    const next = new Set(current)
    if (dragModeRef.current === 'select') next.add(key)
    else next.delete(key)
    selectedRef.current = next
    onChange(next)
  }

  function handleWindowPointerMove(event: PointerEvent) {
    if (!isMouseDownRef.current) return
    didDragRef.current = true
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const key = element?.closest<HTMLElement>('[data-slot-key]')?.dataset.slotKey
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
    // The pointerup that ended a drag also fires a click on the slot it
    // landed on; without this the last hour painted would toggle straight
    // back off.
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    const next = new Set(selectedRef.current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  const table = (
    <div
      ref={fadeRef}
      className={styles.tableScroll}
      style={{ WebkitMaskImage: maskImage, maskImage }}
    >
      {days.map((date) => {
        const dateISO = toISODate(date)
        return (
          <div key={dateISO} className={styles.dayColumn}>
            <p className={styles.dayLabel}>{formatDayLabel(date)}</p>
            <div className={styles.slotList}>
              {AVAILABILITY_HOURS.map((hour) => {
                const key = slotKey(dateISO, hour)
                const isSelected = selected.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    data-slot-key={key}
                    className={isSelected ? `${styles.slot} ${styles.slotSelected}` : styles.slot}
                    aria-pressed={isSelected}
                    aria-label={`${formatDayLabel(date)} at ${formatHourLabel(hour)}`}
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
  )

  if (!framed) return className ? <div className={className}>{table}</div> : table

  return <div className={className ? `${styles.card} ${className}` : styles.card}>{table}</div>
}
