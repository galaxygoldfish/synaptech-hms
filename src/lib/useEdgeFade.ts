import { useEffect, useState } from 'react'

// Tracks whether a horizontally-scrollable element has more content hidden
// off its left/right edges, so a CSS mask fade only shows on the side(s)
// there's actually something to scroll to.
export function useEdgeFade<T extends HTMLElement>() {
  // A callback ref held in state, not a plain ref object: the effect below
  // has to run when the element actually attaches, and with a ref object it
  // runs once on mount and never again. Anything faded that renders after
  // an async load — a table that appears once its data arrives, replacing a
  // skeleton — attached its node after that single run, leaving the mask
  // stuck at "nothing to scroll to" no matter how far the content overflowed.
  const [node, setNode] = useState<T | null>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

  useEffect(() => {
    const el = node
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
  }, [node])

  const maskImage = `linear-gradient(to right, ${
    fadeLeft ? 'transparent 0%, black 3%' : 'black 0%'
  }, ${fadeRight ? 'black 94%, transparent 100%' : 'black 100%'})`

  return { ref: setNode, maskImage }
}

// Same idea as useEdgeFade, but for a vertically-scrollable element — used
// alongside it (on the same DOM node) where a table scrolls in both
// directions, so each axis gets its own independent fade. Pass both to one
// element by calling them from a single ref callback.
export function useVerticalEdgeFade<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

  useEffect(() => {
    const el = node
    if (!el) return

    function updateFade() {
      if (!el) return
      setFadeTop(el.scrollTop > 1)
      setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    }

    updateFade()
    el.addEventListener('scroll', updateFade, { passive: true })
    window.addEventListener('resize', updateFade)
    document.fonts?.ready.then(updateFade)

    const observer = new ResizeObserver(updateFade)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', updateFade)
      window.removeEventListener('resize', updateFade)
      observer.disconnect()
    }
  }, [node])

  const maskImage = `linear-gradient(to bottom, ${
    fadeTop ? 'transparent 0%, black 6%' : 'black 0%'
  }, ${fadeBottom ? 'black 92%, transparent 100%' : 'black 100%'})`

  return { ref: setNode, maskImage }
}
