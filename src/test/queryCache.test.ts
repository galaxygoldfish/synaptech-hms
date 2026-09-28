import { cached, clearCache, invalidate, peekValue, readStash, refresh, stash } from '../lib/queryCache'

afterEach(() => {
  clearCache()
  vi.useRealTimers()
})

describe('cached', () => {
  it('shares one fetch between callers while the entry is fresh', async () => {
    const fetcher = vi.fn().mockResolvedValue(['a'])

    const [first, second] = await Promise.all([cached('k', fetcher), cached('k', fetcher)])
    const third = await cached('k', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(first).toEqual(['a'])
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('refetches once the entry is older than staleMs', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new')

    expect(await cached('k', fetcher, 1000)).toBe('old')
    vi.advanceTimersByTime(1001)
    expect(await cached('k', fetcher, 1000)).toBe('new')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  // An error must never be served from cache: the next screen to ask should
  // try again, not inherit the failure for a minute.
  it('evicts a rejected fetch so the next call retries', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok')

    await expect(cached('k', fetcher)).rejects.toThrow('offline')
    expect(await cached('k', fetcher)).toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('invalidate', () => {
  it('drops only the entries under the given prefix', async () => {
    const loans = vi.fn().mockResolvedValue('loans')
    const equipment = vi.fn().mockResolvedValue('equipment')
    await cached('admin-loans', loans)
    await cached('equipment:list', equipment)

    invalidate('equipment:')
    await cached('admin-loans', loans)
    await cached('equipment:list', equipment)

    expect(loans).toHaveBeenCalledTimes(1)
    expect(equipment).toHaveBeenCalledTimes(2)
  })
})

describe('peekValue', () => {
  // A refresh keeps the last value on screen until the new one lands.
  it('keeps the last value through a refresh', async () => {
    await cached('k', () => Promise.resolve('old'))
    let finish: (value: string) => void = () => {}
    const pending = refresh('k', () => new Promise<string>((resolve) => (finish = resolve)))

    expect(peekValue('k')).toBe('old')
    finish('new')
    await pending
    expect(peekValue('k')).toBe('new')
  })

  // A write means the old copy is wrong: it must not be painted, even briefly.
  it('drops the last value on invalidate and on clearCache', async () => {
    await cached('member-loans:1', () => Promise.resolve('before cancel'))
    invalidate('member-loans:')
    expect(peekValue('member-loans:1')).toBeUndefined()

    await cached('k', () => Promise.resolve('value'))
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
