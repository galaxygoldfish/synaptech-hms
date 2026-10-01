import { useLayoutEffect, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import styles from './PageTransition.module.css'

// Replays a quick, subtle fade whenever the route changes, by remounting
// (via the pathname key) the freshly-matched page underneath.
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigationType = useNavigationType()

  // Remounting the page doesn't reset the window's scroll, so without this a
  // link clicked halfway down one page opens the next one halfway down too.
  // Back/forward (POP) is left to the browser so returning to a list keeps
  // the reader's place.
  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [location.pathname, navigationType])

  return (
    <div key={location.pathname} className={styles.pageTransition}>
      {children}
    </div>
  )
}
