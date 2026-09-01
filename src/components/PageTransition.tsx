import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './PageTransition.module.css'

// Replays a quick, subtle fade whenever the route changes, by remounting
// (via the pathname key) the freshly-matched page underneath.
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className={styles.pageTransition}>
      {children}
    </div>
  )
}
