import { renderHook, waitFor } from '@testing-library/react'
import { fetchMemberLoans, peekMemberLoans, type MemberLoanGroup } from '../lib/memberLoans'
import { useMemberLoans } from '../lib/useMemberLoans'

vi.mock('../lib/memberLoans', async () => {
  const actual = await vi.importActual<typeof import('../lib/memberLoans')>('../lib/memberLoans')
  return { ...actual, fetchMemberLoans: vi.fn(), peekMemberLoans: vi.fn() }
})

function group(id: string): MemberLoanGroup {
  return { loanRequestId: id, requestedAt: '2026-09-01T00:00:00Z' } as MemberLoanGroup
}

const cachedGroups = [group('cached')]
const freshGroups = [group('fresh')]

beforeEach(() => {
  vi.mocked(peekMemberLoans).mockReset().mockReturnValue(null)
  vi.mocked(fetchMemberLoans).mockReset().mockResolvedValue(freshGroups)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.mocked(console.error).mockRestore()
})

describe('useMemberLoans', () => {
  it('always fetches fresh, even with nothing cached', async () => {
    const { result } = renderHook(() => useMemberLoans('member-1'))

    await waitFor(() => expect(result.current.isFresh).toBe(true))
    expect(result.current.groups).toBe(freshGroups)
    expect(fetchMemberLoans).toHaveBeenCalledWith('member-1')
  })

  // The point of the hook: instant from cache, but never *only* the cache,
  // since an admin's hand-off or return happens in another browser.
  it('has the cached copy on the first render, then replaces it with the fresh one', async () => {
    vi.mocked(peekMemberLoans).mockReturnValue(cachedGroups)
    let finishFresh: (groups: MemberLoanGroup[]) => void = () => {}
    vi.mocked(fetchMemberLoans).mockReturnValue(new Promise((resolve) => (finishFresh = resolve)))

    const { result } = renderHook(() => useMemberLoans('member-1'))

    // On the very first render — no skeleton frame — but not to be decided
    // on yet.
    expect(result.current.groups).toBe(cachedGroups)
    expect(result.current.isFresh).toBe(false)

    finishFresh(freshGroups)
    await waitFor(() => expect(result.current.groups).toBe(freshGroups))
    expect(result.current.isFresh).toBe(true)
  })

  it('keeps the cached copy on screen if the refresh fails', async () => {
    vi.mocked(peekMemberLoans).mockReturnValue(cachedGroups)
    vi.mocked(fetchMemberLoans).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useMemberLoans('member-1'))

    await waitFor(() => expect(result.current.groups).toBe(cachedGroups))
    await waitFor(() => expect(fetchMemberLoans).toHaveBeenCalled())
    expect(result.current.failed).toBe(false)
    expect(result.current.isFresh).toBe(false)
  })

  it('reports a failure when there was nothing cached to fall back on', async () => {
    vi.mocked(fetchMemberLoans).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useMemberLoans('member-1'))

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.groups).toBeNull()
  })
})
