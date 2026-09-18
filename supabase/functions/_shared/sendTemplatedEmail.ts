import { createAdminClient } from "./db.ts";
import { renderSegments, type EmailBodySegment } from "./render.ts";
import { sendViaResend } from "./resend.ts";

export interface SendTemplatedEmailInput {
  templateKey: string;
  to: string;
  fields: Record<string, string>;
}

// Every automated email is copied to this address so the club keeps its own
// archive of what went out, independent of the in-app log. Override per
// environment with the EMAIL_ARCHIVE_CC secret; set it to an empty string
// to turn the archive copy off entirely.
const DEFAULT_ARCHIVE_CC = "synaptechuw@gmail.com";

// Exported for the unit test alongside this file.
export function archiveCcFor(recipient: string): string | undefined {
  const configured = Deno.env.get("EMAIL_ARCHIVE_CC");
  const cc = (configured ?? DEFAULT_ARCHIVE_CC).trim();
  if (!cc) return undefined;
  // No point copying an address that is already the recipient — it would
  // just deliver the same message to the same inbox twice.
  if (cc.toLowerCase() === recipient.trim().toLowerCase()) return undefined;
  return cc;
}

// Loads the template row (respecting the enabled toggle from the admin
// UI), renders it against `fields`, sends it, and logs the outcome either
// way. Never throws — a bad recipient or a disabled template shouldn't
// break the caller's batch of other sends.
export async function sendTemplatedEmail(
  admin: ReturnType<typeof createAdminClient>,
  { templateKey, to, fields }: SendTemplatedEmailInput,
): Promise<void> {
  if (!to) return;

  const { data: template, error } = await admin
    .from("email_templates")
    .select("subject, body, label, enabled")
    .eq("key", templateKey)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load email template "${templateKey}":`, error);
    return;
  }
  if (!template || !template.enabled) return;

  const subject = template.subject || template.label;
  const text = renderSegments((template.body ?? []) as EmailBodySegment[], fields);
  const cc = archiveCcFor(to);

  // Logged on both paths so the admin "Automated email log" screen shows
  // the message body that was actually rendered, including for failures —
  // which is usually the thing you need in order to debug one.
  const logRow = {
    template_key: templateKey,
    recipient_email: to,
    cc_email: cc ?? null,
    subject,
    body_text: text,
  };

  try {
    await sendViaResend({ to, subject, text, cc });
    await admin.from("email_log").insert({ ...logRow, status: "sent" });
  } catch (sendError) {
    console.error(`Failed to send "${templateKey}" to ${to}:`, sendError);
    await admin.from("email_log").insert({
      ...logRow,
      status: "failed",
      error: String(sendError),
    });
  }
}
