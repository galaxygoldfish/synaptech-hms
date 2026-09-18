// Invoked by the pg_net triggers in
// supabase/migrations/20260906000000_email_templates.sql whenever a row
// this app writes changes in a way an email template cares about. Body:
// { event: string; recordId: string }. Resolves that event to zero or
// more (template, recipient, fields) sends via the DB, then sends each.
//
// Deploy: supabase functions deploy send-email --no-verify-jwt
// (--no-verify-jwt because the caller is Postgres's pg_net, presenting a
// project secret key on `apikey` rather than a user JWT on `Authorization`
// — withSupabase's own `auth: 'secret'` check below is what actually gates
// this function; the platform's default JWT gate has nothing to check
// against a non-JWT key and would reject every call before we saw it.)
//
// Requires: RESEND_API_KEY secret (supabase secrets set RESEND_API_KEY=...),
// a secret key created under Settings > API Keys, and the Vault secrets
// described in supabase/migrations/20260917000000_email_trigger_vault_secrets.sql
// so notify_email_event knows this function's URL and that key.

import { Buffer } from "node:buffer";
import { withSupabase } from "npm:@supabase/server";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchAdminEmails, formatDate } from "../_shared/db.ts";
import { sendTemplatedEmail, type SendTemplatedEmailInput } from "../_shared/sendTemplatedEmail.ts";

type Dispatch = SendTemplatedEmailInput[];

// Same private bucket src/lib/loanRequests.ts uploads signed agreements to
// at checkout — see LOAN_AGREEMENTS_BUCKET there.
const LOAN_AGREEMENTS_BUCKET = "loan-agreements";

// Downloads a hardware item's signed agreement PDF from Storage and
// base64-encodes it for Resend's `attachments` field. Returns undefined
// for a consumable item (no path at all) or if the download fails — a
// storage hiccup shouldn't stop the confirmation email itself from going
// out, just mean it goes out without the attachment.
async function fetchSignedAgreementAttachment(
  admin: SupabaseClient,
  signedAgreementPath: string | null,
  equipmentName: string,
): Promise<{ filename: string; content: string }[] | undefined> {
  if (!signedAgreementPath) return undefined;

  const { data: pdfBlob, error } = await admin.storage.from(LOAN_AGREEMENTS_BUCKET).download(signedAgreementPath);
  if (error || !pdfBlob) {
    console.error(`loan_item.requested: failed to download signed agreement at ${signedAgreementPath}:`, error);
    return undefined;
  }

  const content = Buffer.from(await pdfBlob.arrayBuffer()).toString("base64");
  const filename = `${equipmentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item"}-loan-agreement.pdf`;
  return [{ filename, content }];
}

// Every query below used to destructure only `data`, silently discarding
// `error` — a genuine query failure (bad grant, RLS denial, whatever) then
// looked identical to "no such row", and resolveEvent quietly returned an
// empty dispatch with no trace of why. This surfaces it as a thrown error
// instead, which the outer handler turns into a {"ok":false,"error":...}
// response — visible in net._http_response for the pg_net caller, and
// logged, rather than disappearing.
function unwrap<T>(
  result: { data: T; error: { message: string } | null },
  context: string,
): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

// Shared by every case below that needs to say who performed an admin
// action (the `admin_name` chip) — either the acting admin's id, passed
// through by a trigger that captured auth.uid() (see
// 20260919000000_equipment_actor_tracking.sql), or a "reviewed_by"-style
// column already on the row itself. Returns "" rather than throwing when
// there's no actor at all, since that's a normal case (most events have
// none), not a query failure.
async function fetchActorName(admin: SupabaseClient, actorId: string | null | undefined): Promise<string> {
  if (!actorId) return "";
  const actor = unwrap(
    await admin.from("profiles").select("first_name, last_name").eq("id", actorId).maybeSingle(),
    "fetching actor profile",
  );
  return actor ? `${actor.first_name} ${actor.last_name}` : "";
}

async function resolveEvent(
  admin: SupabaseClient,
  event: string,
  recordId: string,
  actorId: string | null,
): Promise<Dispatch> {
  switch (event) {
    case "profile.created": {
      const profile = unwrap(
        await admin.from("profiles").select("uw_email, first_name, last_name").eq("id", recordId).maybeSingle(),
        "profile.created: fetching profile",
      );
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
      const profile = unwrap(
        await admin.from("profiles").select("uw_email, first_name, last_name, role").eq("id", recordId).maybeSingle(),
        "profile.role_changed: fetching profile",
      );
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
      const item = unwrap(
        await admin
          .from("loan_request_items")
          .select("loan_request_id, equipment_id, equipment_unit_id, return_date, signed_agreement_path")
          .eq("id", recordId)
          .maybeSingle(),
        "loan_item.requested: fetching loan_request_items row",
      );
      if (!item) return [];

      const request = unwrap(
        await admin.from("loan_requests").select("user_id, requested_at").eq("id", item.loan_request_id).maybeSingle(),
        "loan_item.requested: fetching loan_requests row",
      );
      if (!request) return [];

      const [profileResult, equipmentResult] = await Promise.all([
        admin.from("profiles").select("uw_email, first_name, last_name").eq("id", request.user_id).maybeSingle(),
        admin.from("equipment").select("name").eq("id", item.equipment_id).maybeSingle(),
      ]);
      const profile = unwrap(profileResult, "loan_item.requested: fetching profile");
      const equipment = unwrap(equipmentResult, "loan_item.requested: fetching equipment");
      if (!profile || !equipment) return [];

      let serial = "";
      if (item.equipment_unit_id) {
        const unit = unwrap(
          await admin.from("equipment_units").select("serial_number").eq("id", item.equipment_unit_id).maybeSingle(),
          "loan_item.requested: fetching equipment_units row",
        );
        serial = unit?.serial_number ?? "";
      }

      const fields = {
        user_name: `${profile.first_name} ${profile.last_name}`,
        hardware_name: equipment.name,
        hardware_serial: serial,
        loan_start_date: formatDate(request.requested_at),
        loan_due_date: item.return_date ? formatDate(item.return_date) : "",
      };

      // Only the member-facing confirmation gets the PDF attached — admins
      // already have a "download signed agreement" action on the loan
      // detail screen, so there's no need to duplicate the file into their
      // inbox too. A download failure here shouldn't block the email
      // itself from going out, so it's logged and swallowed rather than
      // thrown.
      const attachments = await fetchSignedAgreementAttachment(admin, item.signed_agreement_path, equipment.name);

      const dispatch: Dispatch = [
        { templateKey: "checkout-request-confirmation", to: profile.uw_email, fields, attachments },
      ];
      const adminEmails = await fetchAdminEmails(admin);
      // One email to every admin together, not one separately-CC'd email
      // per admin — see sendTemplatedEmail's `to: string | string[]`.
      if (adminEmails.length > 0) {
        dispatch.push({ templateKey: "hardware-checkout-requested", to: adminEmails, fields });
      }
      return dispatch;
    }

    case "loan_request.approved": {
      const request = unwrap(
        await admin.from("loan_requests").select("user_id, reviewed_by").eq("id", recordId).maybeSingle(),
        "loan_request.approved: fetching loan_requests row",
      );
      if (!request) return [];

      const item = unwrap(
        await admin
          .from("loan_request_items")
          .select("equipment_id, equipment_unit_id, return_date")
          .eq("loan_request_id", recordId)
          .eq("item_role", "primary")
          .maybeSingle(),
        "loan_request.approved: fetching primary loan_request_items row",
      );
      if (!item) return [];

      const [profileResult, equipmentResult] = await Promise.all([
        admin.from("profiles").select("uw_email, first_name, last_name").eq("id", request.user_id).maybeSingle(),
        admin.from("equipment").select("name").eq("id", item.equipment_id).maybeSingle(),
      ]);
      const profile = unwrap(profileResult, "loan_request.approved: fetching profile");
      const equipment = unwrap(equipmentResult, "loan_request.approved: fetching equipment");
      if (!profile || !equipment) return [];

      let serial = "";
      if (item.equipment_unit_id) {
        const unit = unwrap(
          await admin.from("equipment_units").select("serial_number").eq("id", item.equipment_unit_id).maybeSingle(),
          "loan_request.approved: fetching equipment_units row",
        );
        serial = unit?.serial_number ?? "";
      }

      // reviewed_by is set to the acting admin's id by checkoutLoanRequestItem
      // (src/lib/loanRequests.ts) at the moment of approval — already exactly
      // what hardware-handed-off's admin_name chip needs, no trigger changes
      // required. Harmless to include in `fields` for
      // successful-handoff-confirmation too: that template just has no
      // admin_name chip to consume it.
      const adminName = await fetchActorName(admin, request.reviewed_by);

      const fields = {
        user_name: `${profile.first_name} ${profile.last_name}`,
        hardware_name: equipment.name,
        hardware_serial: serial,
        loan_due_date: item.return_date ? formatDate(item.return_date) : "",
        admin_name: adminName,
      };

      const dispatch: Dispatch = [
        { templateKey: "successful-handoff-confirmation", to: profile.uw_email, fields },
      ];
      const adminEmails = await fetchAdminEmails(admin);
      if (adminEmails.length > 0) {
        dispatch.push({ templateKey: "hardware-handed-off", to: adminEmails, fields });
      }
      return dispatch;
    }

    // Set by markLoanRequestItemReturned (src/lib/loanRequests.ts) when an
    // admin records a hand-back, via the trigger in
    // 20260922000000_loan_item_return.sql. This is the event the
    // successful-return-confirmation and hardware-returned templates have
    // been waiting for since they were seeded — until the return flow
    // existed there was nothing to fire them.
    case "loan_item.returned": {
      const item = unwrap(
        await admin
          .from("loan_request_items")
          .select("loan_request_id, equipment_id, equipment_unit_id, returned_at, returned_by")
          .eq("id", recordId)
          .maybeSingle(),
        "loan_item.returned: fetching loan_request_items row",
      );
      if (!item) return [];

      const request = unwrap(
        await admin.from("loan_requests").select("user_id").eq("id", item.loan_request_id).maybeSingle(),
        "loan_item.returned: fetching loan_requests row",
      );
      if (!request) return [];

      const [profileResult, equipmentResult] = await Promise.all([
        admin.from("profiles").select("uw_email, first_name, last_name").eq("id", request.user_id).maybeSingle(),
        admin.from("equipment").select("name").eq("id", item.equipment_id).maybeSingle(),
      ]);
      const profile = unwrap(profileResult, "loan_item.returned: fetching profile");
      const equipment = unwrap(equipmentResult, "loan_item.returned: fetching equipment");
      if (!profile || !equipment) return [];

      let serial = "";
      if (item.equipment_unit_id) {
        const unit = unwrap(
          await admin.from("equipment_units").select("serial_number").eq("id", item.equipment_unit_id).maybeSingle(),
          "loan_item.returned: fetching equipment_units row",
        );
        serial = unit?.serial_number ?? "";
      }

      // returned_by is the receiving admin, recorded on the row itself —
      // the same shape as loan_request.approved's reviewed_by, so actorId
      // isn't needed here even though the trigger passes one.
      const fields = {
        user_name: `${profile.first_name} ${profile.last_name}`,
        hardware_name: equipment.name,
        hardware_serial: serial,
        return_date: item.returned_at ? formatDate(item.returned_at) : "",
        admin_name: await fetchActorName(admin, item.returned_by),
      };

      const dispatch: Dispatch = [
        { templateKey: "successful-return-confirmation", to: profile.uw_email, fields },
      ];
      const adminEmails = await fetchAdminEmails(admin);
      if (adminEmails.length > 0) {
        dispatch.push({ templateKey: "hardware-returned", to: adminEmails, fields });
      }
      return dispatch;
    }

    case "equipment.created":
    case "equipment.updated": {
      const equipment = unwrap(
        await admin.from("equipment").select("name").eq("id", recordId).maybeSingle(),
        `${event}: fetching equipment row`,
      );
      if (!equipment) return [];

      const templateKey = event === "equipment.created" ? "hardware-item-added" : "hardware-item-modified";
      const fields = { hardware_name: equipment.name, admin_name: await fetchActorName(admin, actorId) };
      const adminEmails = await fetchAdminEmails(admin);
      if (adminEmails.length === 0) return [];
      return [{ templateKey, to: adminEmails, fields }];
    }

    default:
      return [];
  }
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let payload: { event?: string; recordId?: string; actorId?: string | null };
    try {
      payload = await req.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const { event, recordId, actorId } = payload;
    if (!event || !recordId) {
      return new Response("event and recordId are required", { status: 400 });
    }

    const admin = ctx.supabaseAdmin;

    try {
      const dispatch = await resolveEvent(admin, event, recordId, actorId ?? null);
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
  }),
};
