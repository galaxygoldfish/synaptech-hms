// A small in-memory cache for the handful of reads several screens share —
// the admin loans dataset above all, which the dashboard counts, the loans
// list and the check-out/return scan pages each need in full. Without it,
// every navigation between those screens refetched the same tables.
//
// Deliberately minimal rather than a query library: one promise per key,
// reused while fresh, dropped by the mutation functions in src/lib that
// change the underlying rows (never by components), and wiped on sign-out or
// a change of user in AuthContext so one account's data never outlives its
// session. Staleness is bounded by STALE_MS, so edits made by another admin
// show up within a minute even without an invalidation here.

const STALE_MS = 60_000

/** Keys shared between the fetch that fills an entry and the writes that
    drop it, which live in different modules. */
export const CACHE_KEYS = {
  adminLoans: 'admin-loans',
  equipmentList: 'equipment:list',
  /** Followed by the member's user id — one entry per member. */
  memberLoans: 'member-loans:',
} as const

interface Entry {
  promise: Promise<unknown>
  fetchedAt: number
}

const entries = new Map<string, Entry>()

/**
 * Returns the cached promise for `key` while it is younger than `staleMs`,
 * otherwise calls `fetcher` and caches the new promise. Concurrent callers
 * share one in-flight request. A rejected fetch is evicted immediately, so
 * an error is never served from cache.
 */
export function cached<T>(key: string, fetcher: () => Promise<T>, staleMs = STALE_MS): Promise<T> {
  const existing = entries.get(key)
  if (existing && Date.now() - existing.fetchedAt < staleMs) {
    return existing.promise as Promise<T>
  }

  const promise = fetcher()
  const entry: Entry = { promise, fetchedAt: Date.now() }
  entries.set(key, entry)
  promise.catch(() => {
    if (entries.get(key) === entry) entries.delete(key)
  })
  return promise
}

/**
 * Always calls `fetcher`, bypassing whatever is cached, and stores the new
 * promise so the screens that do read from cache see the fresher copy too.
 * For screens that make a decision from the data (the check-out and return
 * flows) rather than just display it: they must never act on a list that
 * predates a request submitted from another browser a moment ago.
 */
export function refresh<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  invalidate(key)
  return cached(key, fetcher)
}

/**
 * The cached promise for `key` whatever its age, or null. For showing
 * something at once while a fresh fetch is under way — never for deciding
 * anything (see useMemberLoans).
 */
export function peek<T>(key: string): Promise<T> | null {
  return (entries.get(key)?.promise as Promise<T> | undefined) ?? null
}

/** Drops every entry whose key starts with `prefix`. */
export function invalidate(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}

export function clearCache(): void {
  entries.clear()
}
