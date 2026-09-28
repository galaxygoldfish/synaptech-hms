import { useEffect, useRef, useState } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom'
import { stash } from './queryCache'

/** How a row reads while its detail screen is being fetched. */
export const PENDING_ROW_STYLE = { opacity: 0.6, cursor: 'progress' } as const

/**
 * For a row that opens a detail screen: fetches that screen's data first,
 * while the current screen stays up (the row reads as busy), stashes it for
 * the detail screen to draw from on its first render (see readStash), then
 * navigates. A failed fetch still navigates — the detail screen loads the
 * ordinary way and reports the error itself.
 *
 * Guards the two things that go wrong with navigate-after-await: a second
 * tap while the first is loading is ignored, and leaving this screen before
 * the fetch lands cancels the navigation rather than yanking the user back.
 */
export function usePrefetchNavigate() {
  const navigate = useNavigate()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const isOpening = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function open<T>(key: string, fetcher: () => Promise<T>, to: To, options?: NavigateOptions) {
    if (isOpening.current) return
    isOpening.current = true
    setPendingKey(key)
    try {
      stash(key, await fetcher())
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to prefetch ${key}:`, error)
    } finally {
      isOpening.current = false
      if (mounted.current) setPendingKey(null)
    }
    if (mounted.current) navigate(to, options)
  }

  return { open, pendingKey }
}
