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

// Admins opted into a CC copy of one specific template via the "CC"
// subsection of the admin editor's Recipients section
// (email_template_recipient_overrides table) — off by default, so most
// templates resolve to no one. Always starts from the live set of
// role='admin' profiles rather than anything cached, so a newly promoted
// admin shows up (CC off) and a demoted one drops out immediately — no
// cleanup of the overrides table needed for either case.
export async function fetchAdminCcOverrides(
  admin: ReturnType<typeof createAdminClient>,
  templateKey: string,
): Promise<string[]> {
  const [{ data: admins, error: adminsError }, { data: overrides, error: overridesError }] = await Promise.all([
    admin.from("profiles").select("id, uw_email").eq("role", "admin"),
    admin
      .from("email_template_recipient_overrides")
      .select("admin_id")
      .eq("template_key", templateKey)
      .eq("cc_enabled", true),
  ]);
  if (adminsError) throw adminsError;
  if (overridesError) throw overridesError;

  const ccAdminIds = new Set((overrides ?? []).map((row) => row.admin_id as string));
  return (admins ?? [])
    .filter((profile) => ccAdminIds.has(profile.id as string))
    .map((profile) => profile.uw_email as string)
    .filter(Boolean);
}

export function formatDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
