import { FunctionsHttpError } from '@supabase/supabase-js'
import { groupLines, groupNames, groupsDetail, GroupSyncBusyError, syncMemberGroups } from '../lib/members'
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

describe('group display helpers', () => {
  const twoGroups = { project_groups: [{ name: 'Mind Games', size: 5 }, { name: 'Robot Arm', size: 1 }] }

  it('lists every group with its size', () => {
    expect(groupLines(twoGroups)).toEqual(['Mind Games · 5', 'Robot Arm · 1'])
    expect(groupsDetail(twoGroups)).toBe('Mind Games (5 members), Robot Arm (1 member)')
    expect(groupNames(twoGroups)).toBe('Mind Games Robot Arm')
  })

  it('shows None for a member in no group', () => {
    expect(groupLines({ project_groups: [] })).toEqual(['None · 1'])
    expect(groupsDetail({ project_groups: [] })).toBe('None')
    expect(groupNames({ project_groups: [] })).toBe('')
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
