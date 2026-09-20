import { createAdminClient } from "./db.ts";
import { renderSegments, renderSegmentsHtml, type EmailBodySegment } from "./render.ts";
import { buildSignatureHtml } from "./signature.ts";
import { sendViaResend } from "./resend.ts";

export interface SendTemplatedEmailInput {
  templateKey: string;
  to: string;
  fields: Record<string, string>;
  /** Files to attach, base64-encoded — see SendEmailInput in resend.ts. */
  attachments?: { filename: string; content: string }[];
  /** Admins opted into a copy of this specific template via the admin
      editor's Recipients section (see fetchAdminCcOverrides in db.ts) —
      distinct from the fixed archive CC below, which every send gets
      regardless of per-template settings. */
  extraCc?: string[];
}

// Every automated email is copied to this address so the club keeps its own
// archive of what went out, independent of the in-app log. Override per
// environment with the EMAIL_ARCHIVE_CC secret; set it to an empty string
// to turn the archive copy off entirely.
const DEFAULT_ARCHIVE_CC = "synaptechuw@gmail.com";

// `sent_date`/`sent_time` — available on every template (see
// 20260918040000_email_universal_date_time_fields.sql) since, unlike every
// other field, they aren't pulled from a row: they're just "when did this
// particular email go out", computed fresh right here. Pacific time, since
// that's where Synaptech/UW actually is — Deno's default runtime clock is
// UTC, which would otherwise show every recipient a time that's off by
// several hours from their own.
const SEND_TIME_ZONE = "America/Los_Angeles";

// Exported for the unit test alongside this file.
export function sentDateTimeFields(now: Date = new Date()): { sent_date: string; sent_time: string } {
  return {
    sent_date: now.toLocaleDateString("en-US", {
      timeZone: SEND_TIME_ZONE,
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    sent_time: now.toLocaleTimeString("en-US", {
      timeZone: SEND_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }),
  };
}

// The literal address, honoring the same EMAIL_ARCHIVE_CC override every
// other use of "the archive address" respects. This is also the "to" that
// an admin-broadcast template's dispatch resolves to now that it's
// "Synaptech", not each admin's own inbox — see dispatchToAdmins in
// send-email/index.ts and sendOverdueAdminAlerts in send-scheduled-
// reminders/index.ts. Exported for the unit test alongside this file.
export function resolveArchiveAddress(): string {
  const configured = Deno.env.get("EMAIL_ARCHIVE_CC");
  return (configured ?? DEFAULT_ARCHIVE_CC).trim();
}

// Exported for the unit test alongside this file.
export function archiveCcFor(recipient: string): string | undefined {
  const cc = resolveArchiveAddress();
  if (!cc) return undefined;
  // No point copying an address that's already the recipient — it would
  // just deliver the same message to the same inbox twice.
  if (recipient.trim().toLowerCase() === cc.toLowerCase()) return undefined;
  return cc;
}

// Case-insensitive de-dupe that keeps the first occurrence's casing —
// used to combine the archive CC with per-template admin CCs, which can
// otherwise legitimately collide (an admin's own address, or the same
// admin appearing via two different code paths).
function dedupeCaseInsensitive(addresses: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(address);
  }
  return result;
}

// Combines the fixed archive CC (unless turned off for this template via
// the "Synaptech" row in the admin editor's Recipients section) with the
// per-template admin CCs from extraCc, dropping the recipient itself (the
// To line) and any duplicates between the two sources.
function ccFor(recipient: string, extraCc: string[] | undefined, archiveCcEnabled: boolean): string[] | undefined {
  const archiveCc = archiveCcEnabled ? archiveCcFor(recipient) : undefined;
  const adminCc = (extraCc ?? [])
    .map((address) => address.trim())
    .filter(Boolean)
    .filter((address) => address.toLowerCase() !== recipient.toLowerCase());
  const cc = dedupeCaseInsensitive([...(archiveCc ? [archiveCc] : []), ...adminCc]);
  return cc.length > 0 ? cc : undefined;
}

// Loads the template row (respecting the enabled toggle from the admin
// UI), renders it against `fields`, sends it, and logs the outcome either
// way. Never throws — a bad recipient or a disabled template shouldn't
// break the caller's batch of other sends.
export async function sendTemplatedEmail(
  admin: ReturnType<typeof createAdminClient>,
  { templateKey, to, fields, attachments, extraCc }: SendTemplatedEmailInput,
): Promise<void> {
  const recipient = to.trim();
  if (!recipient) return;

  const { data: template, error } = await admin
    .from("email_templates")
    .select("subject, body, label, enabled, archive_cc_enabled")
    .eq("key", templateKey)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load email template "${templateKey}":`, error);
    return;
  }
  if (!template || !template.enabled) return;

  const subject = template.subject || template.label;
  const segments = (template.body ?? []) as EmailBodySegment[];

  // Placed after the caller's own fields so they always win — no dispatch
  // path has a legitimate reason to supply its own sent_date/sent_time,
  // and this keeps that a system-computed value, not a caller-suppliable
  // one, rather than merely a convention.
  const allFields = { ...fields, ...sentDateTimeFields() };

  // `text` stays exactly what it always was — the admin editor's segments
  // rendered plain, nothing appended. `html` is the version that actually
  // goes out: the same content wrapped for email-safe HTML, with the brand
  // signature appended at send time only. Templates never store it, so it
  // never appears back in the editor — see signature.ts.
  const text = renderSegments(segments, allFields);
  const html =
    `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #1c2430;">` +
    renderSegmentsHtml(segments, allFields) +
    `</div>` +
    buildSignatureHtml();

  const cc = ccFor(recipient, extraCc, template.archive_cc_enabled);

  // Logged on both paths so the admin "Automated email log" screen shows
  // the message exactly as sent, including for failures — which is
  // usually the thing you need in order to debug one. body_html is what
  // the log renders; body_text is kept as the plain-text fallback record.
  // cc_email joins multiple addresses for display, same as they appear
  // together in the one email Resend actually sent.
  const logRow = {
    template_key: templateKey,
    recipient_email: recipient,
    cc_email: cc ? cc.join(", ") : null,
    subject,
    body_text: text,
    body_html: html,
  };

  try {
    await sendViaResend({ to: recipient, subject, text, html, cc, attachments });
    await admin.from("email_log").insert({ ...logRow, status: "sent" });
  } catch (sendError) {
    console.error(`Failed to send "${templateKey}" to ${recipient}:`, sendError);
    await admin.from("email_log").insert({
      ...logRow,
      status: "failed",
      error: String(sendError),
    });
  }
}
