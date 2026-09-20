import { supabase } from './supabase'
import type { Profile } from '../types/index'

export async function fetchAllProfiles(): Promise<Profile[]> {
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
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'Failed to delete account')
}
