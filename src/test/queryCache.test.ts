import { clearCache, invalidate, peekValue, readStash, refresh, stash } from '../lib/queryCache'

afterEach(() => {
  clearCache()
  vi.useRealTimers()
})

describe('refresh basics', () => {
  // An error must never be served: the next screen to ask should try again.
  it('evicts a rejected fetch so the next call retries', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok')

    await expect(refresh('k', fetcher, 60_000)).rejects.toThrow('offline')
    expect(await refresh('k', fetcher, 60_000)).toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('invalidate drops only the entries under the given prefix', async () => {
    const loans = vi.fn().mockResolvedValue('loans')
    const equipment = vi.fn().mockResolvedValue('equipment')
    await refresh('admin-loans', loans, 60_000)
    await refresh('equipment:list', equipment, 60_000)

    invalidate('equipment:')
    await refresh('admin-loans', loans, 60_000)
    await refresh('equipment:list', equipment, 60_000)

    expect(loans).toHaveBeenCalledTimes(1)
    expect(equipment).toHaveBeenCalledTimes(2)
  })
})

describe('peekValue', () => {
  // A refresh keeps the last value on screen until the new one lands.
  it('keeps the last value through a refresh', async () => {
    await refresh('k', () => Promise.resolve('old'))
    let finish: (value: string) => void = () => {}
    const pending = refresh('k', () => new Promise<string>((resolve) => (finish = resolve)))

    expect(peekValue('k')).toBe('old')
    finish('new')
    await pending
    expect(peekValue('k')).toBe('new')
  })

  // A write means the old copy is wrong: it must not be painted, even briefly.
  it('drops the last value on invalidate and on clearCache', async () => {
    await refresh('member-loans:1', () => Promise.resolve('before cancel'))
    invalidate('member-loans:')
    expect(peekValue('member-loans:1')).toBeUndefined()

    await refresh('k', () => Promise.resolve('value'))
    clearCache()
    expect(peekValue('k')).toBeUndefined()
  })
})

describe('stash', () => {
  // Built into an edit form, so only ever read while very fresh.
  it('is readable briefly, then expires', () => {
    vi.useFakeTimers()
    stash('equipment:manage-item:1', 'data')
    expect(readStash('equipment:manage-item:1')).toBe('data')
    vi.advanceTimersByTime(10_001)
    expect(readStash('equipment:manage-item:1')).toBeUndefined()
  })

  it('is removed by an inventory write', () => {
    stash('equipment:manage-item:1', 'data')
    invalidate('equipment:')
    expect(readStash('equipment:manage-item:1')).toBeUndefined()
  })
})

describe('refresh', () => {
  // React runs effects twice in development, and screens can ask at the same
  // moment: both must share one request, not re-read the tables twice.
  it('shares a request that is still in flight', async () => {
    let finish: (value: string) => void = () => {}
    const fetcher = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)))

    const first = refresh('k', fetcher)
    const second = refresh('k', fetcher)
    finish('value')

    expect(await first).toBe('value')
    expect(await second).toBe('value')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reuses a copy settled within maxAgeMs, and fetches again after', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')

    expect(await refresh('k', fetcher, 5_000)).toBe('first')
    expect(await refresh('k', fetcher, 5_000)).toBe('first')
    vi.advanceTimersByTime(5_001)
    expect(await refresh('k', fetcher, 5_000)).toBe('second')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  // What the check-out and return screens rely on.
  it('never reuses a settled copy when maxAgeMs is 0', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')

    await refresh('k', fetcher)
    expect(await refresh('k', fetcher)).toBe('second')
  })

  // A read started before a write, landing after it, must not repaint the
  // pre-write data.
  it('discards a result that lands after the key was invalidated', async () => {
    let finish: (value: string) => void = () => {}
    const pending = refresh('member-loans:1', () => new Promise<string>((resolve) => (finish = resolve)))

    invalidate('member-loans:')
    finish('before the write')
    await pending

    expect(peekValue('member-loans:1')).toBeUndefined()
  })
})
