import { supabase } from './supabase'

export type AuditCategory = 'members' | 'inventory' | 'loans' | 'emails'

/**
 * Why a change's before/after values aren't in the log. 'pii' — personal
 * data (phone, student ID, address) the audit table deliberately doesn't
 * keep a permanent copy of; 'content' — a body too large to be useful
 * inline (an email template's segment array). Either way the change itself
 * is recorded. See the 20260921000000 migration for the reasoning.
 */
export type AuditHiddenReason = 'pii' | 'content'

export interface AuditChange {
  field: string
  /** Absent when `hidden` is set. Null is a real value: the field was empty. */
  from?: string | null
  to?: string | null
  hidden?: AuditHiddenReason
}

export interface AuditLogEntry {
  id: string
  occurredAt: string
  category: AuditCategory
  /** Dotted event name, e.g. 'member.role_changed'. */
  action: string
  /** Null for anything not done by a signed-in user — see `actorName`. */
  actorId: string | null
  /** Snapshot taken when the entry was written, so it survives the actor
      being renamed or deleted. Null means no signed-in user performed it:
      a scheduled function, a service-role script, or a direct DB change. */
  actorName: string | null
  actorEmail: string | null
  entityType: string
  entityId: string | null
  /** Set only for entities that aren't uuid-keyed (email templates). */
  entityKey: string | null
  entityLabel: string | null
  summary: string
  changes: AuditChange[]
}

interface AuditLogRow {
  id: string
  occurred_at: string
  category: AuditCategory
  action: string
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  entity_type: string
  entity_id: string | null
  entity_key: string | null
  entity_label: string | null
  summary: string
  changes: AuditChange[] | null
}

function mapRow(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    category: row.category,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityKey: row.entity_key,
    entityLabel: row.entity_label,
    summary: row.summary,
    changes: row.changes ?? [],
  }
}

export const AUDIT_LOG_LIMIT = 500

/**
 * How long entries are kept before the scheduled `prune_audit_log` job
 * deletes them. Must stay in step with the interval that job is scheduled
 * with in the 20260921000000 migration: the screen states this policy to
 * admins, so changing one without the other makes the app lie about its
 * own retention.
 */
export const AUDIT_LOG_RETENTION_MONTHS = 12

export interface AuditLogPage {
  entries: AuditLogEntry[]
  /** True when the table holds more than `limit` entries, so the screen can
      say it's showing the most recent ones rather than implying it has
      everything. */
  hasMore: boolean
}

/**
 * The most recent audit entries, newest first. Capped for the same reason
 * as fetchEmailLog: this table only ever grows, and an unbounded select
 * would eventually stall the screen. One extra row is requested so "there
 * is more than this" can be answered without a second count query.
 */
export async function fetchAuditLog(limit = AUDIT_LOG_LIMIT): Promise<AuditLogPage> {
  const { data, error } = await supabase
    .from('audit_log')
    .select(
      'id, occurred_at, category, action, actor_id, actor_name, actor_email, entity_type, entity_id, entity_key, entity_label, summary, changes',
    )
    .order('occurred_at', { ascending: false })
    .limit(limit + 1)

  if (error) throw error

  const rows = (data ?? []) as AuditLogRow[]
  return {
    entries: rows.slice(0, limit).map(mapRow),
    hasMore: rows.length > limit,
  }
}
