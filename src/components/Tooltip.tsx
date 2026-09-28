import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import styles from './Tooltip.module.css'

// Breathing room kept between the bubble and the screen edge.
const VIEWPORT_MARGIN = 12

interface TooltipProps {
  text: string
  children: ReactNode
}

/**
 * Wraps a control (an icon button, say) with the app's dark hover bubble.
 * Opens on hover/focus with no built-in delay — unlike a native `title`,
 * which the browser holds back for up to a second or two.
 */
export function Tooltip({ text, children }: TooltipProps) {
  const [isOpen, setOpen] = useState(false)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const shiftRef = useRef(0)

  // The bubble is centred on its trigger, but the trigger can sit anywhere —
  // near a screen edge a centred bubble would run off it. Once it's on
  // screen, measure it and slide it back inside the viewport; the arrow is
  // counter-shifted in CSS so it keeps pointing at the trigger.
  useLayoutEffect(() => {
    if (!isOpen) return
    const bubble = bubbleRef.current
    if (!bubble) return

    function reposition() {
      if (!bubble) return
      const rect = bubble.getBoundingClientRect()
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

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {isOpen && (
        <span
          className={styles.bubble}
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
