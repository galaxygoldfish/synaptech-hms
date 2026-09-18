import { supabase } from './supabase'

export type EmailBodySegment = { type: 'text'; value: string } | { type: 'chip'; field: string }

export type EmailTemplateCategory = 'user' | 'admin'

export interface EmailTemplate {
  key: string
  category: EmailTemplateCategory
  label: string
  dynamicFields: string[]
  subject: string
  body: EmailBodySegment[]
  enabled: boolean
}

// Every dynamic field any template can reference, and how it renders as a
// chip. Not every template offers every field — see each template's own
// `dynamicFields`.
export const EMAIL_FIELD_LABELS: Record<string, string> = {
  user_name: 'USER NAME',
  admin_name: 'ADMIN NAME',
  hardware_name: 'HARDWARE NAME',
  hardware_serial: 'HARDWARE SERIAL',
  loan_start_date: 'LOAN START DATE',
  loan_due_date: 'LOAN DUE DATE',
  return_date: 'RETURN DATE',
  new_role: 'NEW ROLE',
}

/**
 * Editor-only copy explaining what each template is for. Not stored in the
 * database: this describes how the app behaves, so it belongs with the code
 * that implements that behaviour rather than in an admin-editable row.
 *
 * Every entry below is taken from what actually dispatches the email —
 * supabase/functions/send-email (the notify-on-write triggers in
 * 20260906000000_email_templates.sql) and
 * supabase/functions/send-scheduled-reminders (the daily date-based run).
 */
export interface EmailTemplateDescription {
  /** What the email is, in one sentence. */
  blurb: string
  /** What causes it to be sent. */
  timing: string
  /** Who receives it. */
  recipient: string
  /**
   * Set when no code path sends this template yet. It stays editable, but
   * the editor says so rather than implying the email goes out.
   */
  dormant?: boolean
}

export const EMAIL_TEMPLATE_DESCRIPTIONS: Record<string, EmailTemplateDescription> = {
  // ── Member-facing ──────────────────────────────────────────────────────
  'account-creation-confirmation': {
    blurb: 'Welcomes a new member and confirms their account is ready to use.',
    timing: 'Immediately after a member finishes setting up their profile.',
    recipient: 'The new member.',
  },
  'checkout-request-confirmation': {
    blurb:
      'Acknowledges that a checkout request was received, so the member knows it is waiting on a Hardware Manager.',
    timing: 'Immediately after a member submits a hardware checkout request.',
    recipient: 'The member who made the request.',
  },
  'checkout-request-approval': {
    blurb: 'Tells a member their checkout request was approved.',
    timing:
      'Nothing sends this yet — the app has no separate approval step, so approval and handoff are the same action. "Successful handoff confirmation" is what members actually receive.',
    recipient: 'The member who made the request.',
    dormant: true,
  },
  'return-reminder-one-week': {
    blurb: 'First nudge that a loan is coming to an end, while there is still time to plan a return.',
    timing: 'On the daily reminder run, exactly 7 days before an item is due. Sent once per item.',
    recipient: 'The member holding the item.',
  },
  'return-reminder-due-date': {
    blurb: 'Reminds a member that their hardware is due back today.',
    timing: 'On the daily reminder run, on the due date itself. Sent once per item.',
    recipient: 'The member holding the item.',
  },
  'return-reminder-past-due': {
    blurb: 'Warns a member that their loan is now overdue and asks them to return the item.',
    timing: 'On the daily reminder run, once an item is past its due date. Sent once per item, not daily.',
    recipient: 'The member holding the overdue item.',
  },
  'successful-return-confirmation': {
    blurb: 'Confirms to a member that returned hardware was checked back in and their loan is closed.',
    timing:
      'Nothing sends this yet — it will fire once the return flow records a completed return.',
    recipient: 'The member who returned the item.',
    dormant: true,
  },
  'successful-handoff-confirmation': {
    blurb:
      'Confirms a member has taken possession of the hardware, and restates the due date they agreed to.',
    timing: 'When an admin approves a loan request, which is the point the hardware is handed over.',
    recipient: 'The member receiving the hardware.',
  },

  // ── Admin-facing ───────────────────────────────────────────────────────
  'account-permission-elevation': {
    blurb: 'Notifies a member that they have been granted administrator access.',
    timing:
      'When an admin changes a member\u2019s role to admin. Demotions back to member do not send anything.',
    recipient: 'The member being promoted — not the rest of the admins.',
  },
  'hardware-item-added': {
    blurb: 'Keeps the admin team aware of new products entering the inventory.',
    timing: 'Whenever a new item is added to the hardware inventory.',
    recipient: 'Every administrator.',
  },
  'hardware-item-modified': {
    blurb: 'Flags edits to an existing product so inventory changes are not silent.',
    timing: 'Whenever an existing inventory item is edited and saved.',
    recipient: 'Every administrator.',
  },
  'hardware-checkout-requested': {
    blurb: 'Alerts the admin team that a member is waiting on a checkout request.',
    timing: 'Immediately after a member submits a hardware checkout request.',
    recipient: 'Every administrator.',
  },
  'hardware-handed-off': {
    blurb: 'Records that hardware left the lab and who now holds it.',
    timing: 'When an admin approves a loan request, which is the point the hardware is handed over.',
    recipient: 'Every administrator.',
  },
  'hardware-return-requested': {
    blurb: 'Alerts the admin team that a member wants to return an item.',
    timing:
      'Nothing sends this yet — it will fire once members can request a return from their side.',
    recipient: 'Every administrator.',
    dormant: true,
  },
  'hardware-returned': {
    blurb: 'Records that an item came back and is available again.',
    timing:
      'Nothing sends this yet — it will fire once the return flow records a completed return.',
    recipient: 'Every administrator.',
    dormant: true,
  },
  'hardware-item-overdue': {
    blurb: 'Escalates an overdue item to the admin team so someone can chase it.',
    timing:
      'On the daily reminder run, once an item is past its due date. Sent once per item, so the team is not alerted every day.',
    recipient: 'Every administrator.',
  },
}

interface EmailTemplateRow {
  key: string
  category: EmailTemplateCategory
  label: string
  dynamic_fields: string[] | null
  subject: string | null
  body: EmailBodySegment[] | null
  enabled: boolean
}

function mapRow(row: EmailTemplateRow): EmailTemplate {
  return {
    key: row.key,
    category: row.category,
    label: row.label,
    dynamicFields: row.dynamic_fields ?? [],
    subject: row.subject ?? '',
    body: row.body ?? [],
    enabled: row.enabled,
  }
}

export async function fetchEmailTemplates(category: EmailTemplateCategory): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('key, category, label, dynamic_fields, subject, body, enabled')
    .eq('category', category)
    .order('sort_order')

  if (error) throw error
  return (data as EmailTemplateRow[]).map(mapRow)
}

export async function fetchEmailTemplate(key: string): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('key, category, label, dynamic_fields, subject, body, enabled')
    .eq('key', key)
    .maybeSingle()

  if (error) throw error
  return data ? mapRow(data as EmailTemplateRow) : null
}

export interface UpdateEmailTemplateContentInput {
  subject: string
  body: EmailBodySegment[]
}

export async function updateEmailTemplateContent(
  key: string,
  input: UpdateEmailTemplateContentInput,
  updatedBy: string,
): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .update({ subject: input.subject, body: input.body, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('key', key)
    .select('key, category, label, dynamic_fields, subject, body, enabled')
    .single()

  if (error) throw error
  return mapRow(data as EmailTemplateRow)
}

export async function setEmailTemplateEnabled(key: string, enabled: boolean, updatedBy: string): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .update({ enabled, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('key', key)
    .select('key, category, label, dynamic_fields, subject, body, enabled')
    .single()

  if (error) throw error
  return mapRow(data as EmailTemplateRow)
}
