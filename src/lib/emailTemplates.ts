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
