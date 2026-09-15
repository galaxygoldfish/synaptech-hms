import { createAdminClient } from "./db.ts";
import { renderSegments, type EmailBodySegment } from "./render.ts";
import { sendViaResend } from "./resend.ts";

export interface SendTemplatedEmailInput {
  templateKey: string;
  to: string;
  fields: Record<string, string>;
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
    // eslint-disable-next-line no-console
    console.error(`Failed to load email template "${templateKey}":`, error);
    return;
  }
  if (!template || !template.enabled) return;

  const subject = template.subject || template.label;
  const text = renderSegments((template.body ?? []) as EmailBodySegment[], fields);

  try {
    await sendViaResend({ to, subject, text });
    await admin.from("email_log").insert({ template_key: templateKey, recipient_email: to, subject, status: "sent" });
  } catch (sendError) {
    // eslint-disable-next-line no-console
    console.error(`Failed to send "${templateKey}" to ${to}:`, sendError);
    await admin.from("email_log").insert({
      template_key: templateKey,
      recipient_email: to,
      subject,
      status: "failed",
      error: String(sendError),
    });
  }
}
