// Reads every project group's Google Sheet and records, on each profile,
// which group the member is in (profiles.project_group, null = none) and how
// many people that group's sheet lists (profiles.project_group_size, 1 if
// none). Admin-facing only — no member screen reads either column.
//
// Callers:
//   * the "Sync groups" button on the admin members screen, through
//     supabase.functions.invoke — a signed-in user's JWT, accepted only if
//     their profile is an admin;
//   * pg_cron, nightly, through public.trigger_member_group_sync() in
//     20261104010000_member_groups.sql — the project secret key on `apikey`.
// withSupabase({ auth: ['user', 'secret'] }) accepts exactly those two and
// rejects anything else (including an invalid JWT) before this code runs.
//
// Deploy: supabase functions deploy sync-member-groups --no-verify-jwt
// (the platform's JWT check would turn the cron call away — a secret key
// isn't a JWT — so withSupabase does the checking instead, as in send-email).
//
// Secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON  the service account's JSON key. The account
//                                needs Viewer on the groups folder, nothing else.
//   GROUP_SHEETS_FOLDER_ID       the Drive folder holding the group sheets
//   GROUP_SHEET_TAB (optional)   read only this tab of each sheet; unset,
//                                every tab is searched for an email column
//
// A run that can't reach Google or finds no readable sheet changes nothing,
// so an outage or a wrong folder id never resets everyone to "None".

import { withSupabase } from "npm:@supabase/server";
import { createAdminClient } from "../_shared/db.ts";
import {
  getFolderName,
  getGoogleAccessToken,
  listGroupSources,
  parseServiceAccount,
  readSpreadsheetTabs,
} from "../_shared/google.ts";
import {
  type CandidateSheet,
  emailsFromTabs,
  groupNameFor,
  pickRosterSheet,
  resolveMemberGroups,
  type GroupSheet,
  type MemberForMatching,
} from "../_shared/memberGroups.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

/** A run still unfinished after this long is assumed to have crashed. */
const STALE_RUN_MINUTES = 10;
/** Sheets read at once — well inside the Sheets API's per-minute quota. */
const READ_CONCURRENCY = 4;
const RUN_RETENTION_DAYS = 90;
const PROFILE_PAGE_SIZE = 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not set for this function`);
  return value;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchAllMembers(admin: AdminClient): Promise<Array<MemberForMatching & { project_group: string | null; project_group_size: number }>> {
  const members: Array<MemberForMatching & { project_group: string | null; project_group_size: number }> = [];
  for (let from = 0; ; from += PROFILE_PAGE_SIZE) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, first_name, last_name, uw_email, project_group, project_group_size")
      .order("id")
      .range(from, from + PROFILE_PAGE_SIZE - 1);
    if (error) throw error;
    members.push(...(data ?? []));
    if (!data || data.length < PROFILE_PAGE_SIZE) return members;
  }
}

interface SyncOutcome {
  sheetsScanned: number;
  membersMatched: number;
  membersUpdated: number;
  warnings: string[];
}

async function runSync(admin: AdminClient): Promise<SyncOutcome> {
  const serviceAccount = parseServiceAccount(requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
  const folderId = requireEnv("GROUP_SHEETS_FOLDER_ID");
  const onlyTab = Deno.env.get("GROUP_SHEET_TAB")?.trim() || undefined;

  const token = await getGoogleAccessToken(serviceAccount);
  const folderName = await getFolderName(token, folderId, serviceAccount.client_email);
  const { groups: sources, rootExcelFiles } = await listGroupSources(token, folderId);
  const sheetCount = sources.reduce((sum, source) => sum + source.spreadsheets.length, 0);
  if (sheetCount === 0) {
    const excel = rootExcelFiles + sources.reduce((sum, source) => sum + source.excelFiles, 0);
    throw new Error(
      `No Google Sheets found in "${folderName}" or its project folders` +
        (excel > 0 ? ` (${excel} Excel files found; open each and use File → Save as Google Sheets)` : ""),
    );
  }

  const warnings: string[] = [];
  const excelNote = (count: number) =>
    count > 0 ? ` It has ${count} Excel file${count === 1 ? "" : "s"}, which need saving as Google Sheets.` : "";

  // Read every sheet once, then decide per project which one is its roster.
  const allSheets = sources.flatMap((source) => source.spreadsheets);
  const read = await mapWithConcurrency(allSheets, READ_CONCURRENCY, async (sheet): Promise<CandidateSheet | null> => {
    try {
      const emails = emailsFromTabs(await readSpreadsheetTabs(token, sheet.spreadsheetId, onlyTab));
      return { spreadsheetId: sheet.spreadsheetId, name: sheet.name, emails };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`sync-member-groups: could not read "${sheet.name}" (${sheet.spreadsheetId}):`, error);
      warnings.push(`"${sheet.name}" could not be read${error instanceof Error ? ` (${error.message})` : ""}; skipped.`);
      return null;
    }
  });
  const readById = new Map(
    read.filter((sheet): sheet is CandidateSheet => sheet !== null).map((sheet) => [sheet.spreadsheetId, sheet]),
  );

  const groups: GroupSheet[] = [];
  for (const source of sources) {
    const name = groupNameFor(source);
    if (source.spreadsheets.length === 0) {
      warnings.push(`"${name}" has no Google Sheets; skipped.${excelNote(source.excelFiles)}`);
      continue;
    }
    const candidates = source.spreadsheets
      .map((sheet) => readById.get(sheet.spreadsheetId))
      .filter((sheet): sheet is CandidateSheet => !!sheet);
    if (candidates.length === 0) continue; // every sheet failed to read; already warned
    const pick = pickRosterSheet(candidates);
    if (!pick) {
      const anyColumn = candidates.some((sheet) => sheet.emails !== null);
      warnings.push(
        anyColumn
          ? `"${name}" has an email column but no emails in it; skipped.`
          : `"${name}" has no sheet with an email column${onlyTab ? ` on a tab named "${onlyTab}"` : ""}; skipped.`,
      );
      continue;
    }
    if (pick.others.length > 0) {
      warnings.push(`"${name}" has several sheets with emails; used "${pick.chosen.name}" (not ${pick.others.map((n) => `"${n}"`).join(", ")}).`);
    }
    groups.push({ spreadsheetId: pick.chosen.spreadsheetId, name, emails: pick.chosen.emails });
  }

  if (groups.length === 0) {
    throw new Error(`None of the ${sources.length} projects in "${folderName}" had a readable members table`);
  }

  const members = await fetchAllMembers(admin);
  const { assignments, warnings: matchWarnings } = resolveMemberGroups(members, groups);
  warnings.push(...matchWarnings);

  // Only rows that actually change are written, so the audit log records
  // real moves rather than every member every night.
  const changed = members.filter((member) => {
    const next = assignments.get(member.id)!;
    return next.project_group !== member.project_group || next.project_group_size !== member.project_group_size;
  });

  await mapWithConcurrency(changed, 8, async (member) => {
    const { error } = await admin.from("profiles").update(assignments.get(member.id)!).eq("id", member.id);
    if (error) throw error;
  });

  const membersMatched = [...assignments.values()].filter((a) => a.project_group !== null).length;
  return { sheetsScanned: groups.length, membersMatched, membersUpdated: changed.length, warnings };
}

export default {
  fetch: withSupabase({ auth: ["user", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const admin = createAdminClient();
    let triggeredBy: string | null = null;

    if (ctx.authMode === "user") {
      const userId = ctx.userClaims?.id;
      if (!userId) return json({ ok: false, error: "Invalid session" }, 401);

      const { data: caller, error } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error) {
        // eslint-disable-next-line no-console
        console.error("sync-member-groups: failed to look up caller profile:", error);
        return json({ ok: false, error: "Could not verify caller" }, 500);
      }
      if (caller?.role !== "admin") {
        return json({ ok: false, error: "Admin access required" }, 403);
      }
      triggeredBy = userId;
    }

    // Close out a run that died without finishing, so it can't block every
    // later one through the one-running index.
    const staleBefore = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
    await admin
      .from("member_group_sync_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, error: "Did not finish" })
      .is("finished_at", null)
      .lt("started_at", staleBefore);

    const { data: run, error: runError } = await admin
      .from("member_group_sync_runs")
      .insert({ trigger: triggeredBy ? "manual" : "cron", triggered_by: triggeredBy })
      .select("id")
      .single();
    if (runError) {
      if (runError.code === "23505") {
        return json({ ok: false, error: "A sync is already running" }, 409);
      }
      // eslint-disable-next-line no-console
      console.error("sync-member-groups: failed to start a run:", runError);
      return json({ ok: false, error: "Could not start the sync" }, 500);
    }

    try {
      const outcome = await runSync(admin);
      await admin
        .from("member_group_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          sheets_scanned: outcome.sheetsScanned,
          members_matched: outcome.membersMatched,
          warnings: outcome.warnings,
        })
        .eq("id", run.id);

      const retainAfter = new Date(Date.now() - RUN_RETENTION_DAYS * 86_400_000).toISOString();
      await admin.from("member_group_sync_runs").delete().lt("started_at", retainAfter);

      return json({ ok: true, ...outcome });
    } catch (error) {
      // PostgrestError isn't an Error subclass, but has a message too.
      const message = (error as { message?: string } | null)?.message || "Unknown error";
      // eslint-disable-next-line no-console
      console.error("sync-member-groups: run failed:", error);
      await admin
        .from("member_group_sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: false, error: message })
        .eq("id", run.id);
      return json({ ok: false, error: message }, 500);
    }
  }),
};
