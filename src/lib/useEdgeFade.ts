import { useEffect, useRef, useState } from 'react'

// Tracks whether a horizontally-scrollable element has more content hidden
// off its left/right edges, so a CSS mask fade only shows on the side(s)
// there's actually something to scroll to.
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function updateFade() {
      if (!el) return
      setFadeLeft(el.scrollLeft > 1)
      setFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }

    updateFade()
    el.addEventListener('scroll', updateFade, { passive: true })
    window.addEventListener('resize', updateFade)

    // The row's true scrollWidth isn't known until webfonts finish loading
    // (they can render wider than the fallback font) — recheck once ready
    // so the fade doesn't stay stuck off from an early, fallback-font
    // measurement.
    document.fonts?.ready.then(updateFade)

    const observer = new ResizeObserver(updateFade)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', updateFade)
      window.removeEventListener('resize', updateFade)
      observer.disconnect()
    }
  }, [])

  const maskImage = `linear-gradient(to right, ${
    fadeLeft ? 'transparent 0%, black 3%' : 'black 0%'
  }, ${fadeRight ? 'black 94%, transparent 100%' : 'black 100%'})`

  return { ref, maskImage }
}
