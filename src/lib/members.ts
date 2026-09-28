import { supabase } from './supabase'
import { CACHE_KEYS, invalidate, peekValue, refresh } from './queryCache'
import type { Profile } from '../types/index'

// Always fetched fresh, but remembered so the screen can paint it
// straight away next time (see useFreshData).
export function fetchAllProfiles(): Promise<Profile[]> {
  return refresh(CACHE_KEYS.members, () => loadAllProfiles())
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
  invalidate(CACHE_KEYS.membersAll)
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
  invalidate(CACHE_KEYS.membersAll)
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to delete account')
}
