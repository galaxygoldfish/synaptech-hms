// Thin wrapper over Resend's REST API — a raw fetch instead of their SDK
// so this has zero extra dependencies in the Deno runtime. Swapping
// providers later means replacing just this one file.

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  /** Archive copy. Omitted from the request entirely when not set. */
  cc?: string;
}

export async function sendViaResend({ to, subject, text, cc }: SendEmailInput): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured for this function");

  // Resend's shared onboarding@resend.dev sender works without a verified
  // domain, but (per Resend's own sandbox rules) can only deliver to the
  // Resend account's own email until a sending domain is verified. Set
  // EMAIL_FROM_ADDRESS once a real domain is verified — see this repo's
  // README "Automated emails" section.
  const from = Deno.env.get("EMAIL_FROM_ADDRESS") ?? "Synaptech Hardware <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    // `cc` is only included when present — Resend rejects a null/empty cc.
    body: JSON.stringify({ from, to, subject, text, ...(cc ? { cc } : {}) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}
