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
  /** Whether the fixed archive CC (EMAIL_ARCHIVE_CC_ADDRESS) is applied to
      this template — the "Synaptech" row in the Recipients section. */
  archiveCcEnabled: boolean
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
  // Unlike every field above, these aren't tied to a specific business
  // event — they're the date/time the email itself went out, computed at
  // send time (see sendTemplatedEmail.ts) rather than pulled from a row.
  // Available on every template for that reason.
  sent_date: 'DATE',
  sent_time: 'TIME',
}

// Mirrors DEFAULT_ARCHIVE_CC in supabase/functions/_shared/sendTemplatedEmail.ts.
// The frontend has no way to read that function's live EMAIL_ARCHIVE_CC
// secret — this documents the default every template CCs, same as "Sent"
// and "Goes to" describe default behaviour rather than a live-queried
// per-environment value.
export const EMAIL_ARCHIVE_CC_ADDRESS = 'synaptechuw@gmail.com'

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
/**
 * A plain sentence for a recipient resolveEvent can't name an address for
 * ahead of time (the specific member the triggering row is about), or a
 * {name, email} pair for one resolveEvent always sends to the same known
 * address — currently only Synaptech, for the templates that used to
 * broadcast to every admin. The object form renders as a name+email row
 * matching the CC list below it (see RecipientsSection in
 * EditEmailTemplate.tsx), which also uses it to hide that same address
 * from the CC list — no point offering to CC someone who's already the
 * direct recipient.
 */
export type EmailTemplateRecipient = string | { name: string; email: string }

export interface EmailTemplateDescription {
  /** What the email is, in one sentence. */
  blurb: string
  /** What causes it to be sent. */
  timing: string
  /**
   * Who the direct ("to") recipient is. Fixed by the code in resolveEvent,
   * not admin-editable — shown as the non-toggleable "Recipient" row in
   * the edit screen's Recipients section, next to the CC list that is
   * editable.
   */
  recipient: EmailTemplateRecipient
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
    recipient: 'The member being promoted.',
  },
  'hardware-item-added': {
    blurb: 'Keeps the admin team aware of new products entering the inventory.',
    timing: 'Whenever a new item is added to the hardware inventory.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
  },
  'hardware-item-modified': {
    blurb: 'Flags edits to an existing product so inventory changes are not silent.',
    timing: 'Whenever an existing inventory item is edited and saved.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
  },
  'hardware-checkout-requested': {
    blurb: 'Alerts the admin team that a member is waiting on a checkout request.',
    timing: 'Immediately after a member submits a hardware checkout request.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
  },
  'hardware-handed-off': {
    blurb: 'Records that hardware left the lab and who now holds it.',
    timing: 'When an admin approves a loan request, which is the point the hardware is handed over.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
  },
  'hardware-return-requested': {
    blurb: 'Alerts the admin team that a member wants to return an item.',
    timing:
      'Nothing sends this yet — it will fire once members can request a return from their side.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
    dormant: true,
  },
  'hardware-returned': {
    blurb: 'Records that an item came back and is available again.',
    timing:
      'Nothing sends this yet — it will fire once the return flow records a completed return.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
    dormant: true,
  },
  'hardware-item-overdue': {
    blurb: 'Escalates an overdue item to the admin team so someone can chase it.',
    timing:
      'On the daily reminder run, once an item is past its due date. Sent once per item, so the team is not alerted every day.',
    recipient: { name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS },
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
  archive_cc_enabled: boolean
}

// Every read/write below selects exactly these columns, so it's centralized
// once here rather than repeated as a string literal five times.
const EMAIL_TEMPLATE_COLUMNS = 'key, category, label, dynamic_fields, subject, body, enabled, archive_cc_enabled'

function mapRow(row: EmailTemplateRow): EmailTemplate {
  return {
    key: row.key,
    category: row.category,
    label: row.label,
    dynamicFields: row.dynamic_fields ?? [],
    subject: row.subject ?? '',
    body: row.body ?? [],
    enabled: row.enabled,
    archiveCcEnabled: row.archive_cc_enabled,
  }
}

export async function fetchEmailTemplates(category: EmailTemplateCategory): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select(EMAIL_TEMPLATE_COLUMNS)
    .eq('category', category)
    .order('sort_order')

  if (error) throw error
  return (data as EmailTemplateRow[]).map(mapRow)
}

export async function fetchEmailTemplate(key: string): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select(EMAIL_TEMPLATE_COLUMNS)
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
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single()

  if (error) throw error
  return mapRow(data as EmailTemplateRow)
}

export async function setEmailTemplateEnabled(key: string, enabled: boolean, updatedBy: string): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .update({ enabled, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('key', key)
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single()

  if (error) throw error
  return mapRow(data as EmailTemplateRow)
}

export async function setEmailTemplateArchiveCc(
  key: string,
  enabled: boolean,
  updatedBy: string,
): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .update({ archive_cc_enabled: enabled, updated_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('key', key)
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single()

  if (error) throw error
  return mapRow(data as EmailTemplateRow)
}

// ── Per-template CC overrides ──────────────────────────────────────────────
// Backs the CC list in the edit-template screen's Recipients section. Who
// the direct ("to") recipient is isn't admin-configurable — see `recipient`
// on EmailTemplateDescription above, which describes it — so this only
// covers CC. Every current admin is listed with a switch, off by default;
// an admin with no override row for this template just hasn't been
// touched. Always queried from the live `profiles` table rather than
// anything cached, so a newly promoted admin shows up (CC off) and a
// demoted one disappears the next time this screen loads — nothing to keep
// in sync by hand as the admin team changes.

export interface TemplateRecipient {
  id: string
  name: string
  email: string
  ccEnabled: boolean
}

interface RecipientOverrideRow {
  admin_id: string
  cc_enabled: boolean
}

export async function fetchTemplateRecipients(templateKey: string): Promise<TemplateRecipient[]> {
  const [adminsResult, overridesResult] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, uw_email').eq('role', 'admin').order('first_name'),
    supabase
      .from('email_template_recipient_overrides')
      .select('admin_id, cc_enabled')
      .eq('template_key', templateKey),
  ])

  if (adminsResult.error) throw adminsResult.error
  if (overridesResult.error) throw overridesResult.error

  const overrideByAdmin = new Map(
    (overridesResult.data as RecipientOverrideRow[]).map((row) => [row.admin_id, row]),
  )

  return adminsResult.data.map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    email: row.uw_email,
    ccEnabled: overrideByAdmin.get(row.id)?.cc_enabled ?? false,
  }))
}

export async function setTemplateRecipientCc(
  templateKey: string,
  adminId: string,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase.from('email_template_recipient_overrides').upsert(
    {
      template_key: templateKey,
      admin_id: adminId,
      cc_enabled: enabled,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: 'template_key,admin_id' },
  )
  if (error) throw error
}
