import { useEffect, useState } from 'react'
import { fetchMemberLoans, peekMemberLoans, type MemberLoanGroup } from './memberLoans'

export interface MemberLoansState {
  /** Null until something — cached or fresh — is available. */
  groups: MemberLoanGroup[] | null
  /** True once the fresh fetch has landed. Anything that decides on the
      loans (the overdue block on checkout) waits for this; what is merely
      shown doesn't. */
  isFresh: boolean
  /** The fresh fetch failed and there was nothing cached to show instead. */
  failed: boolean
  /** The fresh fetch failed, whether or not a cached copy is still shown.
      A screen that decides on the loans treats this as an error. */
  refreshFailed: boolean
}

function initialState(userId: string | null | undefined): MemberLoansState {
  return { groups: userId ? peekMemberLoans(userId) : null, isFresh: false, failed: false, refreshFailed: false }
}

/**
 * A member's loans, stale-while-revalidate: the list the last screen loaded
 * (if any) is on the very first render — no skeleton frame — and a fresh
 * fetch always follows and replaces it. Handing hardware over and checking it
 * back in happen in an admin's browser, so the member's cache never hears
 * about them; serving it alone would show hardware as still requested, or
 * still overdue, after the fact.
 *
 * Lives outside memberLoans.ts so the fetches go through that module's
 * exports, which is what tests mock.
 */
export function useMemberLoans(userId: string | null | undefined): MemberLoansState {
  const [state, setState] = useState<MemberLoansState>(() => initialState(userId))

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const cachedGroups = peekMemberLoans(userId)
    setState({ groups: cachedGroups, isFresh: false, failed: false, refreshFailed: false })

    fetchMemberLoans(userId, { fresh: true })
      .then((groups) => {
        if (!cancelled) setState({ groups, isFresh: true, failed: false, refreshFailed: false })
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load hardware loans:', error)
        // Keep a cached list on screen rather than swapping it for an error.
        if (!cancelled) {
          setState({ groups: cachedGroups, isFresh: false, failed: !cachedGroups, refreshFailed: true })
        }
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  return state
}
