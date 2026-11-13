import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { CACHE_KEYS, invalidate, peekValue, refresh, DISPLAY_REUSE_MS } from './queryCache'
import type { Profile } from '../types/index'

// Always fetched fresh, but remembered so the screen can paint it
// straight away next time (see useFreshData).
export function fetchAllProfiles(): Promise<Profile[]> {
  return refresh(CACHE_KEYS.members, () => loadAllProfiles(), DISPLAY_REUSE_MS)
}

/** The list as last loaded, synchronously, or null. Display only. */
export function peekAllProfiles(): Profile[] | null {
  return peekValue<Profile[]>(CACHE_KEYS.members) ?? null
}

async function loadAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('first_name', { ascending: true })

  if (error) throw error
  return data as Profile[]
}

export async function fetchProfileById(id: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (error) throw error
  return data as Profile
}

export async function updateMemberRole(id: string, role: 'member' | 'admin'): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select().single()
  invalidate(CACHE_KEYS.members)
  if (error) throw error
  return data as Profile
}

export async function countAdmins(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')

  if (error) throw error
  return count ?? 0
}

// Deleting another user's auth account needs the service-role key, which
// never reaches the client — see supabase/functions/delete-user.
export async function deleteMember(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>('delete-user', {
    body: { userId: id },
  })
  // Deleting a member takes their loan requests with them.
  invalidate(CACHE_KEYS.adminLoans)
  invalidate(CACHE_KEYS.members)
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to delete account')
}

// ── Project groups ──────────────────────────────────────────────────────
// profiles.project_groups is written only by the sync-member-groups Edge
// Function, which reads the group sheets in the club Drive (see AGENTS.md,
// "Project groups"). Admin screens only.

function groupsOf(member: Pick<Profile, 'project_groups'>) {
  return member.project_groups ?? []
}

/** The members list's group lines, one per group, size first: ["5 · Mind Games", "4 · Stress Test Gaming"], or ["1 · None"]. */
export function groupLines(member: Pick<Profile, 'project_groups'>): string[] {
  const groups = groupsOf(member)
  if (groups.length === 0) return ['1 · None']
  return groups.map((group) => `${group.size} · ${group.name}`)
}

/** Member details' wording: "Mind Games (5 members), Stress Test Gaming (4 members)", or "None". */
export function groupsDetail(member: Pick<Profile, 'project_groups'>): string {
  const groups = groupsOf(member)
  if (groups.length === 0) return 'None'
  return groups.map((group) => `${group.name} (${group.size} ${group.size === 1 ? 'member' : 'members'})`).join(', ')
}

/** The group names, for search. */
export function groupNames(member: Pick<Profile, 'project_groups'>): string {
  return groupsOf(member).map((group) => group.name).join(' ')
}

export interface GroupSyncRun {
  id: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  trigger: 'manual' | 'cron'
  sheets_scanned: number | null
  members_matched: number | null
  warnings: string[]
  error: string | null
}

export interface GroupSyncResult {
  sheetsScanned: number
  membersMatched: number
  membersUpdated: number
  warnings: string[]
}

/** Another sync (the nightly one, or another admin's click) is still running. */
export class GroupSyncBusyError extends Error {
  constructor() {
    super('A group sync is already running. Try again in a minute.')
    this.name = 'GroupSyncBusyError'
  }
}

/** The most recent sync attempt, finished or not, or null if none has run. */
export async function fetchLastGroupSync(): Promise<GroupSyncRun | null> {
  const { data, error } = await supabase
    .from('member_group_sync_runs')
    .select('id, started_at, finished_at, ok, trigger, sheets_scanned, members_matched, warnings, error')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as GroupSyncRun | null) ?? null
}

async function functionErrorMessage(error: FunctionsHttpError): Promise<string | null> {
  try {
    const body = (await error.context.json()) as { error?: string }
    return body?.error ?? null
  } catch {
    return null
  }
}

export async function syncMemberGroups(): Promise<GroupSyncResult> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string } & GroupSyncResult>(
    'sync-member-groups',
    { body: {} },
  )
  // Whatever happened, some profiles may have been rewritten.
  invalidate(CACHE_KEYS.members)
  invalidate(CACHE_KEYS.auditLog)

  if (error) {
    if (error instanceof FunctionsHttpError) {
      if (error.context.status === 409) throw new GroupSyncBusyError()
      const message = await functionErrorMessage(error)
      if (message) throw new Error(message)
    }
    throw error
  }
  if (!data?.ok) throw new Error(data?.error ?? 'The group sync failed')
  return {
    sheetsScanned: data.sheetsScanned,
    membersMatched: data.membersMatched,
    membersUpdated: data.membersUpdated,
    warnings: data.warnings ?? [],
  }
}
