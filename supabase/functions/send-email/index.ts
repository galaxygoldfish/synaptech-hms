// Invoked by the pg_net triggers in
// supabase/migrations/20260906000000_email_templates.sql whenever a row
// this app writes changes in a way an email template cares about. Body:
// { event: string; recordId: string }. Resolves that event to zero or
// more (template, recipient, fields) sends via the DB, then sends each.
//
// Deploy: supabase functions deploy send-email
// Requires: RESEND_API_KEY secret (supabase secrets set RESEND_API_KEY=...)
// and, for the pg_net trigger to be able to call this at all, the two
// `app.settings.*` database settings described in that migration.

import { createAdminClient, fetchAdminEmails, formatDate } from "../_shared/db.ts";
import { sendTemplatedEmail, type SendTemplatedEmailInput } from "../_shared/sendTemplatedEmail.ts";

type Dispatch = SendTemplatedEmailInput[];

async function resolveEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: string,
  recordId: string,
): Promise<Dispatch> {
  switch (event) {
    case "profile.created": {
      const { data: profile } = await admin
        .from("profiles")
        .select("uw_email, first_name, last_name")
        .eq("id", recordId)
        .maybeSingle();
      if (!profile) return [];
      return [
        {
          templateKey: "account-creation-confirmation",
          to: profile.uw_email,
          fields: { user_name: `${profile.first_name} ${profile.last_name}` },
        },
      ];
    }

    case "profile.role_changed": {
      const { data: profile } = await admin
        .from("profiles")
        .select("uw_email, first_name, last_name, role")
        .eq("id", recordId)
        .maybeSingle();
      // "Account permission elevation" — only the promote direction, not demotions.
      if (!profile || profile.role !== "admin") return [];
      return [
        {
          templateKey: "account-permission-elevation",
          to: profile.uw_email,
          fields: { user_name: `${profile.first_name} ${profile.last_name}`, new_role: profile.role },
        },
      ];
    }

    case "loan_item.requested": {
      const { data: item } = await admin
        .from("loan_request_items")
        .select("loan_request_id, equipment_id, equipment_unit_id, return_date")
        .eq("id", recordId)
        .maybeSingle();
      if (!item) return [];

      const { data: request } = await admin
        .from("loan_requests")
        .select("user_id, requested_at")
        .eq("id", item.loan_request_id)
        .maybeSingle();
      if (!request) return [];

      const [{ data: profile }, { data: equipment }] = await Promise.all([
        admin.from("profiles").select("uw_email, first_name, last_name").eq("id", request.user_id).maybeSingle(),
        admin.from("equipment").select("name").eq("id", item.equipment_id).maybeSingle(),
      ]);
      if (!profile || !equipment) return [];

      let serial = "";
      if (item.equipment_unit_id) {
        const { data: unit } = await admin
          .from("equipment_units")
          .select("serial_number")
          .eq("id", item.equipment_unit_id)
          .maybeSingle();
        serial = unit?.serial_number ?? "";
      }

      const fields = {
        user_name: `${profile.first_name} ${profile.last_name}`,
        hardware_name: equipment.name,
        hardware_serial: serial,
        loan_start_date: formatDate(request.requested_at),
        loan_due_date: item.return_date ? formatDate(item.return_date) : "",
      };

      const dispatch: Dispatch = [
        { templateKey: "checkout-request-confirmation", to: profile.uw_email, fields },
      ];
      for (const adminEmail of await fetchAdminEmails(admin)) {
        dispatch.push({ templateKey: "hardware-checkout-requested", to: adminEmail, fields });
      }
      return dispatch;
    }

    case "loan_request.approved": {
      const { data: request } = await admin.from("loan_requests").select("user_id").eq("id", recordId).maybeSingle();
      if (!request) return [];

      const { data: item } = await admin
        .from("loan_request_items")
        .select("equipment_id, equipment_unit_id, return_date")
        .eq("loan_request_id", recordId)
        .eq("item_role", "primary")
        .maybeSingle();
      if (!item) return [];

      const [{ data: profile }, { data: equipment }] = await Promise.all([
        admin.from("profiles").select("uw_email, first_name, last_name").eq("id", request.user_id).maybeSingle(),
        admin.from("equipment").select("name").eq("id", item.equipment_id).maybeSingle(),
      ]);
      if (!profile || !equipment) return [];

      let serial = "";
      if (item.equipment_unit_id) {
        const { data: unit } = await admin
          .from("equipment_units")
          .select("serial_number")
          .eq("id", item.equipment_unit_id)
          .maybeSingle();
        serial = unit?.serial_number ?? "";
      }

      const fields = {
        user_name: `${profile.first_name} ${profile.last_name}`,
        hardware_name: equipment.name,
        hardware_serial: serial,
        loan_due_date: item.return_date ? formatDate(item.return_date) : "",
      };

      const dispatch: Dispatch = [
        { templateKey: "successful-handoff-confirmation", to: profile.uw_email, fields },
      ];
      for (const adminEmail of await fetchAdminEmails(admin)) {
        dispatch.push({ templateKey: "hardware-handed-off", to: adminEmail, fields });
      }
      return dispatch;
    }

    case "equipment.created":
    case "equipment.updated": {
      const { data: equipment } = await admin.from("equipment").select("name").eq("id", recordId).maybeSingle();
      if (!equipment) return [];

      const templateKey = event === "equipment.created" ? "hardware-item-added" : "hardware-item-modified";
      const fields = { hardware_name: equipment.name };
      return (await fetchAdminEmails(admin)).map((to) => ({ templateKey, to, fields }));
    }

    default:
      return [];
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (req.headers.get("Authorization") !== expectedAuth) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { event?: string; recordId?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { event, recordId } = payload;
  if (!event || !recordId) {
    return new Response("event and recordId are required", { status: 400 });
  }

  const admin = createAdminClient();

  try {
    const dispatch = await resolveEvent(admin, event, recordId);
    await Promise.all(dispatch.map((send) => sendTemplatedEmail(admin, send)));
    return new Response(JSON.stringify({ ok: true, sent: dispatch.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`send-email failed for event "${event}" (${recordId}):`, error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
