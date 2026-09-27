import { useEffect, useState } from 'react'
import { fetchMemberLoans, peekMemberLoans, type MemberLoanGroup } from './memberLoans'

export interface MemberLoansState {
  /** Null until something — cached or fresh — has arrived. */
  groups: MemberLoanGroup[] | null
  /** True once the fresh fetch has landed. Anything that decides on the
      loans (the overdue block on checkout) waits for this; what is merely
      shown doesn't. */
  isFresh: boolean
  /** The fresh fetch failed and there was nothing cached to show instead. */
  failed: boolean
}

/**
 * A member's loans, stale-while-revalidate: the copy cached by the last
 * screen that loaded them (if any) is shown at once, and a fresh fetch always
 * follows and replaces it. Handing hardware over and checking it back in
 * happen in an admin's browser, so the member's cache never hears about them
 * — serving it alone would show hardware as still requested, or still
 * overdue, after the fact. This keeps navigation instant without that.
 *
 * Lives outside memberLoans.ts so the fetches go through that module's
 * exports, which is what tests mock.
 */
export function useMemberLoans(userId: string | null | undefined): MemberLoansState {
  const [state, setState] = useState<MemberLoansState>({ groups: null, isFresh: false, failed: false })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    let freshArrived = false
    let showedCached = false
    setState({ groups: null, isFresh: false, failed: false })

    // Taken before the fresh fetch starts, which replaces the cache entry.
    peekMemberLoans(userId)
      ?.then((groups) => {
        if (cancelled || freshArrived) return
        showedCached = true
        setState({ groups, isFresh: false, failed: false })
      })
      .catch(() => {
        // Nothing to show from cache; the fresh fetch reports its own failure.
      })

    fetchMemberLoans(userId, { fresh: true })
      .then((groups) => {
        if (cancelled) return
        freshArrived = true
        setState({ groups, isFresh: true, failed: false })
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load hardware loans:', error)
        if (cancelled) return
        // Keep a cached list on screen rather than swapping it for an error.
        if (!showedCached) setState({ groups: null, isFresh: false, failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  return state
}
