import { cached, clearCache, invalidate } from '../lib/queryCache'

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
