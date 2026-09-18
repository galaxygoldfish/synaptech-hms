import { useEffect, useId, useRef, useState } from 'react'
import { QuestionIcon } from './admin-dashboard/icons'
import styles from './InfoTooltip.module.css'

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
  const tooltipId = useId()

  const isOpen = isHovered || isFocused || isPinned

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
        <span className={styles.bubble} id={tooltipId} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
