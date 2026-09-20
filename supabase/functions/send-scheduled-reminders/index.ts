// Runs once a day (see this repo's README "Automated emails" section for
// how to schedule it via Supabase Cron) and sends the date-based reminder
// emails that nothing else would trigger — return-reminder-one-week/
// due-date/past-due, plus the admin-facing hardware-item-overdue alert.
//
// Deploy: supabase functions deploy send-scheduled-reminders
// Requires: RESEND_API_KEY secret (same as send-email).
//
// Idempotency: each loan_request_items row has one *_sent_at column per
// reminder kind (see the 20260906000000_email_templates.sql migration) —
// a reminder is only sent once no matter how many days in a row this runs
// and finds the same overdue item.

import { createAdminClient, fetchAdminCcOverrides, formatDate } from "../_shared/db.ts";
import { resolveArchiveAddress, sendTemplatedEmail } from "../_shared/sendTemplatedEmail.ts";

type Admin = ReturnType<typeof createAdminClient>;

interface LoanItemRow {
  id: string;
  loan_request_id: string;
  equipment_id: string;
  equipment_unit_id: string | null;
  return_date: string;
}

interface ItemContext {
  to: string;
  fields: Record<string, string>;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchApprovedRequestIds(admin: Admin): Promise<string[]> {
  const { data, error } = await admin.from("loan_requests").select("id").eq("status", "approved");
  if (error) throw error;
  return (data ?? []).map((request) => request.id as string);
}

// Same zipped-plain-queries approach as the rest of this app's Supabase
// access (see src/lib/loanRequests.ts) rather than an embedded select —
// this codebase has hit real PostgREST schema-cache bugs with those.
async function fetchItemsByReturnDate(
  admin: Admin,
  approvedRequestIds: string[],
  match: { eq?: string; lt?: string },
  trackingColumn: string,
): Promise<LoanItemRow[]> {
  if (approvedRequestIds.length === 0) return [];

  let query = admin
    .from("loan_request_items")
    .select("id, loan_request_id, equipment_id, equipment_unit_id, return_date")
    .in("loan_request_id", approvedRequestIds)
    .is(trackingColumn, null);

  query = match.eq ? query.eq("return_date", match.eq) : query.lt("return_date", match.lt as string);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LoanItemRow[];
}

async function loadItemContexts(admin: Admin, items: LoanItemRow[]): Promise<Map<string, ItemContext>> {
  const contextByItem = new Map<string, ItemContext>();
  if (items.length === 0) return contextByItem;

  const requestIds = [...new Set(items.map((item) => item.loan_request_id))];
  const { data: requests } = await admin.from("loan_requests").select("id, user_id").in("id", requestIds);

  const userIds = [...new Set((requests ?? []).map((request) => request.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, uw_email, first_name, last_name")
    .in("id", userIds);

  const equipmentIds = [...new Set(items.map((item) => item.equipment_id))];
  const { data: equipmentRows } = await admin.from("equipment").select("id, name").in("id", equipmentIds);

  const unitIds = items.map((item) => item.equipment_unit_id).filter((id): id is string => Boolean(id));
  const { data: unitRows } =
    unitIds.length > 0
      ? await admin.from("equipment_units").select("id, serial_number").in("id", [...new Set(unitIds)])
      : { data: [] as { id: string; serial_number: string }[] };

  const requestById = new Map((requests ?? []).map((request) => [request.id, request]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const equipmentById = new Map((equipmentRows ?? []).map((row) => [row.id, row]));
  const unitById = new Map((unitRows ?? []).map((row) => [row.id, row]));

  for (const item of items) {
    const request = requestById.get(item.loan_request_id);
    const profile = request ? profileById.get(request.user_id) : undefined;
    const equipment = equipmentById.get(item.equipment_id);
    if (!profile || !equipment) continue;

    const unit = item.equipment_unit_id ? unitById.get(item.equipment_unit_id) : undefined;
    contextByItem.set(item.id, {
      to: profile.uw_email as string,
      fields: {
        user_name: `${profile.first_name} ${profile.last_name}`,
        hardware_name: equipment.name as string,
        hardware_serial: unit?.serial_number ?? "",
        loan_due_date: formatDate(item.return_date),
      },
    });
  }

  return contextByItem;
}

async function sendReminderBatch(
  admin: Admin,
  items: LoanItemRow[],
  templateKey: string,
  trackingColumn: "reminder_one_week_sent_at" | "reminder_due_date_sent_at" | "reminder_past_due_sent_at",
): Promise<number> {
  const contextByItem = await loadItemContexts(admin, items);
  // Same for every item in this batch — they all use the same template —
  // so it's resolved once up front rather than per item.
  const extraCc = await fetchAdminCcOverrides(admin, templateKey);
  let sent = 0;

  for (const item of items) {
    const context = contextByItem.get(item.id);
    if (!context) continue;

    await sendTemplatedEmail(admin, {
      templateKey,
      to: context.to,
      fields: context.fields,
      extraCc: extraCc.length > 0 ? extraCc : undefined,
    });
    await admin
      .from("loan_request_items")
      .update({ [trackingColumn]: new Date().toISOString() })
      .eq("id", item.id);
    sent += 1;
  }

  return sent;
}

async function sendOverdueAdminAlerts(admin: Admin, items: LoanItemRow[]): Promise<number> {
  const contextByItem = await loadItemContexts(admin, items);
  // One email per item, to Synaptech's own address — same as every other
  // admin-facing template (see dispatchToAdmins in send-email/index.ts) —
  // with individually opted-in admins CC'd on top, rather than every admin
  // getting their own personal copy.
  const to = resolveArchiveAddress();
  const extraCc = await fetchAdminCcOverrides(admin, "hardware-item-overdue");
  let sent = 0;

  for (const item of items) {
    const context = contextByItem.get(item.id);
    if (!context) continue;

    if (to) {
      await sendTemplatedEmail(admin, {
        templateKey: "hardware-item-overdue",
        to,
        fields: context.fields,
        extraCc: extraCc.length > 0 ? extraCc : undefined,
      });
      sent += 1;
    }
    // Marked as notified either way — an empty archive address (someone
    // set EMAIL_ARCHIVE_CC to "" to disable it) shouldn't make this retry
    // the same overdue item every day forever.
    await admin
      .from("loan_request_items")
      .update({ overdue_admin_notified_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  return sent;
}

Deno.serve(async (req) => {
  const expectedAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (req.headers.get("Authorization") !== expectedAuth) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayISO = toISODate(today);
  const oneWeekOut = toISODate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));

  try {
    const approvedRequestIds = await fetchApprovedRequestIds(admin);

    const [oneWeekItems, dueTodayItems, pastDueItems, unnotifiedOverdueItems] = await Promise.all([
      fetchItemsByReturnDate(admin, approvedRequestIds, { eq: oneWeekOut }, "reminder_one_week_sent_at"),
      fetchItemsByReturnDate(admin, approvedRequestIds, { eq: todayISO }, "reminder_due_date_sent_at"),
      fetchItemsByReturnDate(admin, approvedRequestIds, { lt: todayISO }, "reminder_past_due_sent_at"),
      fetchItemsByReturnDate(admin, approvedRequestIds, { lt: todayISO }, "overdue_admin_notified_at"),
    ]);

    const results = {
      oneWeek: await sendReminderBatch(admin, oneWeekItems, "return-reminder-one-week", "reminder_one_week_sent_at"),
      dueDate: await sendReminderBatch(admin, dueTodayItems, "return-reminder-due-date", "reminder_due_date_sent_at"),
      pastDue: await sendReminderBatch(admin, pastDueItems, "return-reminder-past-due", "reminder_past_due_sent_at"),
      overdueAdminAlerts: await sendOverdueAdminAlerts(admin, unnotifiedOverdueItems),
    };

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("send-scheduled-reminders failed:", error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
