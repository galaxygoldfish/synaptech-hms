import { Skeleton, SkeletonScreen } from './Skeleton'
import styles from './AppShellSkeleton.module.css'

/**
 * Shown while the auth session is still resolving, in place of the old
 * bare "Loading…" text. Intentionally generic: the route that follows may
 * be the welcome page, the member dashboard or the admin dashboard, so
 * this only stands in for the chrome every one of them shares.
 */
export function AppShellSkeleton() {
  return (
    <SkeletonScreen label="Loading…" className={styles.page}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <Skeleton width="2.5rem" height="2.5rem" shape="circle" />
          <Skeleton width="9rem" height="1.75rem" shape="pill" />
        </div>
        <Skeleton width="9.5rem" height="3rem" radius="1rem" />
      </div>

      <div className={styles.main}>
        <Skeleton height="7.5rem" radius="1.25rem" />
        <Skeleton height="4.5rem" radius="1.25rem" />
        <div className={styles.block}>
          <Skeleton height="3.5rem" radius="0.625rem" />
          <Skeleton height="3.5rem" radius="0.625rem" />
          <Skeleton height="3.5rem" radius="0.625rem" />
        </div>
      </div>
    </SkeletonScreen>
  )
}
