import { FunctionsHttpError } from '@supabase/supabase-js'
import { groupLabel, groupSize, GroupSyncBusyError, syncMemberGroups } from '../lib/members'
import * as queryCache from '../lib/queryCache'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }))
}

beforeEach(() => {
  vi.mocked(supabase.functions.invoke).mockReset()
})

describe('groupLabel / groupSize', () => {
  it('shows the group and its size', () => {
    const member = { project_group: 'EEG Speller', project_group_size: 5 }
    expect(groupLabel(member)).toBe('EEG Speller')
    expect(groupSize(member)).toBe(5)
  })

  it('shows None and 1 for a member in no group', () => {
    const member = { project_group: null, project_group_size: 1 }
    expect(groupLabel(member)).toBe('None')
    expect(groupSize(member)).toBe(1)
  })
})

describe('syncMemberGroups', () => {
  it('calls the function and returns its summary', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, sheetsScanned: 4, membersMatched: 12, membersUpdated: 3, warnings: ['w'] },
      error: null,
    } as never)

    await expect(syncMemberGroups()).resolves.toEqual({
      sheetsScanned: 4,
      membersMatched: 12,
      membersUpdated: 3,
      warnings: ['w'],
    })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('sync-member-groups', { body: {} })
  })

  it('drops the cached member list and audit log, even when the sync fails', async () => {
    await queryCache.refresh(queryCache.CACHE_KEYS.members, async () => ['stale member list'])
    await queryCache.refresh(queryCache.CACHE_KEYS.auditLog, async () => ['stale audit log'])
    expect(queryCache.peekValue(queryCache.CACHE_KEYS.members)).toBeDefined()

    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(500, { ok: false, error: 'boom' }),
    } as never)

    await expect(syncMemberGroups()).rejects.toThrow('boom')
    expect(queryCache.peekValue(queryCache.CACHE_KEYS.members)).toBeUndefined()
    expect(queryCache.peekValue(queryCache.CACHE_KEYS.auditLog)).toBeUndefined()
  })

  it('reports a sync already in progress as GroupSyncBusyError', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: httpError(409, { ok: false, error: 'A sync is already running' }),
    } as never)

    await expect(syncMemberGroups()).rejects.toBeInstanceOf(GroupSyncBusyError)
  })
})
