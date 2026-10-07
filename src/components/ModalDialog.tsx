import { useEffect, useRef, useState, type HTMLAttributes } from 'react'

interface ModalDialogProps extends HTMLAttributes<HTMLDivElement> {
  /** Called on Escape. Leave it out for a dialog that can't be dismissed
      (the sign-in account error) or while one is busy submitting. */
  onClose?: () => void
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function focusableIn(container: HTMLElement): HTMLElement[] {
  // Skips controls that are rendered but not shown (a collapsed panel), so
  // Tab can't wrap onto something invisible.
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest('[hidden], [inert]') && (element.checkVisibility?.() ?? true),
  )
}

// Dialogs can stack (the hand-off screen opens a confirmation over its
// profile modal), and every one listens on document — only the topmost
// should answer Escape or hold Tab.
const openDialogs: HTMLElement[] = []

// The box of a modal: announced as a dialog, takes focus when it opens,
// keeps Tab inside it while it's up, closes on Escape, and gives focus back
// to whatever opened it. Without this, a keyboard or screen-reader user was
// left on the page underneath — tabbing through controls they couldn't see
// behind the overlay. Render it only while the modal is open; the overlay
// around it stays each modal's own.
export function ModalDialog({ onClose, onClick, children, ...rest }: ModalDialogProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Read during render, not in the effect: by the time effects run, an
  // autoFocus field inside the dialog has already taken focus, and the
  // trigger to return to would be lost.
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    openDialogs.push(dialog)

    // A modal that focuses its own field (autoFocus, or an effect) keeps it.
    if (!dialog.contains(document.activeElement)) {
      ;(focusableIn(dialog)[0] ?? dialog).focus()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!dialog || openDialogs[openDialogs.length - 1] !== dialog) return

      if (event.key === 'Escape') {
        if (onCloseRef.current) {
          event.preventDefault()
          onCloseRef.current()
        }
        return
      }

      if (event.key !== 'Tab') return
      const focusable = focusableIn(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openDialogs.splice(openDialogs.indexOf(dialog), 1)
      // Only if focus went down with the dialog — a confirm that navigates
      // or focuses something itself has already put focus where it wants.
      const active = document.activeElement
      if (returnFocusTo?.isConnected && (active === document.body || active === null || dialog.contains(active))) {
        returnFocusTo.focus()
      }
    }
  }, [returnFocusTo])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      {...rest}
      onClick={(event) => {
        // Clicks inside the box mustn't reach the overlay's click-to-close.
        event.stopPropagation()
        onClick?.(event)
      }}
    >
      {children}
    </div>
  )
}
