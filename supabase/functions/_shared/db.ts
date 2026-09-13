// Service-role Supabase client — bypasses RLS entirely, so this must only
// ever be used server-side (Edge Functions), never shipped to the browser.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
// into every deployed Edge Function's environment; nothing to configure.

import { createClient } from "npm:@supabase/supabase-js@2";

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in this function's environment");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

// Every profile with the admin role, for the admin-facing templates that
// notify "the hardware managers" as a group rather than one specific
// person.
export async function fetchAdminEmails(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data, error } = await admin.from("profiles").select("uw_email").eq("role", "admin");
  if (error) throw error;
  return (data ?? []).map((row) => row.uw_email as string).filter(Boolean);
}

export function formatDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
