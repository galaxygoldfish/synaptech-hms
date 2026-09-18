import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { QuestionIcon } from './admin-dashboard/icons'
import styles from './InfoTooltip.module.css'

// Breathing room kept between the bubble and the screen edge.
const VIEWPORT_MARGIN = 12

interface InfoTooltipProps {
  /** What the question mark explains. */
  label: string
  text: string
}

/**
 * A question-mark button that explains the control beside it.
 *
 * Opens on hover for a mouse, on focus for a keyboard, and on click — which
 * is the only one of the three a touchscreen has. Closing on Escape and on
 * an outside tap matters for the same reason: without them a tooltip opened
 * by tapping has no way to be dismissed.
 */
export function InfoTooltip({ label, text }: InfoTooltipProps) {
  // Hover and click are tracked apart rather than as one "open" flag. With a
  // single flag, a mouse user clicking the icon would toggle *closed* — the
  // pointer moving onto it had already opened it — which reads as the button
  // being broken. Clicking now pins it instead, and pinning is what a
  // touchscreen has, since it has no hover to give.
  const [isHovered, setHovered] = useState(false)
  const [isFocused, setFocused] = useState(false)
  const [isPinned, setPinned] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const shiftRef = useRef(0)
  const tooltipId = useId()

  const isOpen = isHovered || isFocused || isPinned

  // The bubble is centred on the icon, but the icon can sit anywhere — on a
  // phone a centred label puts it near either edge. Once the bubble is on
  // screen, measure it and slide it back inside the viewport; the arrow is
  // counter-shifted in CSS so it keeps pointing at the icon. A layout effect,
  // so the correction lands before the first paint rather than flashing.
  useLayoutEffect(() => {
    if (!isOpen) return
    const bubble = bubbleRef.current
    if (!bubble) return

    function reposition() {
      if (!bubble) return
      const rect = bubble.getBoundingClientRect()
      // Where the bubble would sit with no correction applied.
      const left = rect.left - shiftRef.current
      const right = rect.right - shiftRef.current
      const viewportWidth = document.documentElement.clientWidth
      let next = 0
      if (left < VIEWPORT_MARGIN) next = VIEWPORT_MARGIN - left
      else if (right > viewportWidth - VIEWPORT_MARGIN) next = viewportWidth - VIEWPORT_MARGIN - right
      shiftRef.current = next
      setShift(next)
    }

    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [isOpen, text])

  useEffect(() => {
    if (!isOpen) return

    function closeAll() {
      setPinned(false)
      setHovered(false)
      setFocused(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAll()
    }
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) closeAll()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  return (
    <span className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onClick={() => setPinned((wasPinned) => !wasPinned)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <QuestionIcon size={18} />
      </button>
      {isOpen && (
        <span
          className={styles.bubble}
          id={tooltipId}
          role="tooltip"
          ref={bubbleRef}
          style={{ '--bubble-shift': `${shift}px` } as CSSProperties}
        >
          {text}
        </span>
      )}
    </span>
  )
}
