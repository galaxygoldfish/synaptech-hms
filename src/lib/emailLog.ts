import { supabase } from './supabase'

export type EmailLogStatus = 'sent' | 'failed'

export interface EmailLogEntry {
  id: string
  templateKey: string
  /** Human-readable template name, joined from `email_templates`. */
  templateLabel: string
  category: 'user' | 'admin' | null
  recipientEmail: string
  ccEmail: string | null
  subject: string
  /** Null for rows logged before the body column existed — see the
      20260916010000 migration. The UI distinguishes this from an empty body. */
  bodyText: string | null
  status: EmailLogStatus
  error: string | null
  sentAt: string
}

interface EmailLogRow {
  id: string
  template_key: string
  recipient_email: string
  cc_email: string | null
  subject: string
  body_text: string | null
  status: EmailLogStatus
  error: string | null
  sent_at: string
  email_templates: { label: string; category: 'user' | 'admin' } | null
}

function mapRow(row: EmailLogRow): EmailLogEntry {
  return {
    id: row.id,
    templateKey: row.template_key,
    // Falls back to the raw key so a template deleted from the seed set
    // still shows something meaningful rather than an empty cell.
    templateLabel: row.email_templates?.label ?? row.template_key,
    category: row.email_templates?.category ?? null,
    recipientEmail: row.recipient_email,
    ccEmail: row.cc_email,
    subject: row.subject,
    bodyText: row.body_text,
    status: row.status,
    error: row.error,
    sentAt: row.sent_at,
  }
}

/**
 * Every email the app has sent, newest first. Capped because this table
 * only grows — the log is a diagnostic surface, not an archive to page
 * through, and an unbounded select would eventually stall the screen.
 */
export async function fetchEmailLog(limit = 500): Promise<EmailLogEntry[]> {
  const { data, error } = await supabase
    .from('email_log')
    .select('id, template_key, recipient_email, cc_email, subject, body_text, status, error, sent_at, email_templates(label, category)')
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as unknown as EmailLogRow[]).map(mapRow)
}
