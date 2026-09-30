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
  equipmentAvailability: 'equipment:availability',
  inventorySummary: 'equipment:summary',
  /** Every equipment-derived key above, and the stashes below — what an
      inventory write invalidates. */
  equipmentAll: 'equipment:',
  /** Followed by an equipment id: the admin item page's data, stashed by the
      inventory list just before opening it. */
  manageItem: 'equipment:manage-item:',
  /** Followed by an equipment id: that item's units table, likewise. */
  manageItemUnits: 'equipment:manage-units:',
  /** Followed by a loan_request_items id: the admin loan detail screen. */
  loanDetail: 'admin-loans:detail:',
  /** Followed by a loan_request_items id: the member's loan detail screen. */
  memberLoanItem: 'member-loans:item:',
  members: 'members:list',
  /** Followed by a profile id: the admin member detail screen. */
  memberDetail: 'members:detail:',
  /** Everything members-derived — what a profile write invalidates. */
  membersAll: 'members:',
  emailTemplates: 'emails:templates',
  /** Followed by a template id: the template editor. */
  emailTemplate: 'emails:template:',
  emailLog: 'emails:log',
  /** Everything email-derived — what a template write invalidates. */
  emailsAll: 'emails:',
  auditLog: 'audit-log',
  inventoryAudits: 'inventory-audits:list',
  /** Followed by an audit id: a past audit's report. */
  inventoryAuditReport: 'inventory-audits:report:',
  /** Everything audit-derived — what recording an audit invalidates. */
  inventoryAuditsAll: 'inventory-audits:',
  /** The new-audit scan screen's inventory, prefetched from the audit list. */
  auditableInventory: 'equipment:auditable',
  /** Followed by an equipment id: the "get labels" product screen. */
  labelsProduct: 'equipment:labels:',
  /** Followed by a loan_request_items id: the hand-off agreement screen. */
  handOff: 'admin-loans:handoff:',
  /** The member's sign-agreement step: its items and the units they'll get. */
  signAgreement: 'equipment:sign-agreement',
  /** Followed by a target key: a request's or item's availability hours. */
  availability: 'availability:',
} as const

interface Entry {
  promise: Promise<unknown>
  fetchedAt: number
  /** When the fetch resolved; unset while it's still in flight. */
  settledAt?: number
}

/**
 * How long a display screen reuses a just-fetched copy instead of fetching
 * again. Short: it exists so bouncing between screens (dashboard → list →
 * dashboard) and React's doubled effects in development don't re-read whole
 * tables every time, not to let data go stale. Screens that decide something
 * from the data pass `fresh: true` to their fetch and skip it.
 */
export const DISPLAY_REUSE_MS = 5_000

const entries = new Map<string, Entry>()

// Data fetched for one imminent navigation (see stash). Separate from the
// cache proper: only ever read while very fresh, so an edit form can start
// from it.
const stashed = new Map<string, { value: unknown; at: number }>()

// The last value each key resolved to, kept through invalidations and
// refreshes (unlike `entries`) so a screen can paint it on its very first
// render while the fresh copy loads. Display only; cleared with clearCache.
const lastValues = new Map<string, unknown>()

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
  promise.then(
    (value) => {
      // Only if this is still the current request for the key. A fetch
      // started before a write and landing after it (the write invalidated
      // it) must not repaint the old data.
      if (entries.get(key) !== entry) return
      entry.settledAt = Date.now()
      lastValues.set(key, value)
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key)
    },
  )
  return promise
}

/**
 * Always calls `fetcher`, bypassing whatever is cached, and stores the new
 * promise so the screens that do read from cache see the fresher copy too.
 * For screens that make a decision from the data (the check-out and return
 * flows) rather than just display it: they must never act on a list that
 * predates a request submitted from another browser a moment ago.
 */
export function refresh<T>(key: string, fetcher: () => Promise<T>, maxAgeMs = 0): Promise<T> {
  // A request already in flight is as fresh as a new one would be, so share
  // it; a settled one is reused only while younger than maxAgeMs.
  const existing = entries.get(key)
  if (existing && (existing.settledAt === undefined || Date.now() - existing.settledAt < maxAgeMs)) {
    return existing.promise as Promise<T>
  }
  // Only the entry: the last value stays on screen until this one lands.
  entries.delete(key)
  return cached(key, fetcher)
}

/**
 * The last value `key` resolved to, however old, synchronously — or
 * undefined if it never has. Synchronous so a screen can render it on its
 * first paint instead of flashing a skeleton for a frame. For showing
 * something while a fresh fetch is under way, never for deciding anything
 * (see useMemberLoans and useInventoryCatalog).
 */
export function peekValue<T>(key: string): T | undefined {
  return lastValues.get(key) as T | undefined
}

/**
 * Drops every entry whose key starts with `prefix`, and its last value: the
 * write that calls this changed the data, so the old copy shouldn't be
 * painted even for a moment (a member who just cancelled a request must not
 * see it listed as pending on the way back to their loans).
 */
export function invalidate(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
  for (const key of lastValues.keys()) {
    if (key.startsWith(prefix)) lastValues.delete(key)
  }
  for (const key of stashed.keys()) {
    if (key.startsWith(prefix)) stashed.delete(key)
  }
}

/**
 * Hands data fetched just before a navigation to the screen it opens, so
 * that screen can draw on its first render instead of fetching again behind
 * a skeleton — the admin inventory list does this for the item page.
 */
export function stash(key: string, value: unknown): void {
  stashed.set(key, { value, at: Date.now() })
}

/**
 * The stashed value for `key` if it was stashed within `maxAgeMs`, else
 * undefined. Only that fresh, because a form may be built from it; a write
 * to the data (invalidate) removes it outright.
 */
export function readStash<T>(key: string, maxAgeMs = 10_000): T | undefined {
  const entry = stashed.get(key)
  if (!entry || Date.now() - entry.at > maxAgeMs) return undefined
  return entry.value as T
}

export function clearCache(): void {
  entries.clear()
  lastValues.clear()
  stashed.clear()
}
