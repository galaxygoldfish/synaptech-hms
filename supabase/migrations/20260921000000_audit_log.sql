-- App audit log: an append-only record of every state change this app makes
-- to its own data — who did it, to what, and (where it's safe to keep) what
-- changed. Backs the admin "App audit log" screen (/adminHome/audit-log,
-- src/components/admin-dashboard/AuditLog.tsx).
--
-- Written as Postgres triggers rather than calls from src/lib/*.ts on
-- purpose. The frontend talks straight to PostgREST from the browser, so a
-- client-side log would only ever record what the client remembered to
-- report, and would miss anything done from the SQL editor, an Edge
-- Function, or a future second client. A trigger sees the write itself.
--
-- The actor is auth.uid(), which reflects the original request's JWT claims
-- regardless of a SECURITY DEFINER function's own context — the same
-- property 20260919000000_equipment_actor_tracking.sql relies on for
-- equipment's admin_name chip. A null actor is therefore genuinely "not a
-- signed-in user": the scheduled-reminder function, a service-role script,
-- or a change made directly in the dashboard. The UI renders that as
-- "System".
--
-- NOT covered here, deliberately:
--   * loan_request_availability — one row per free hour in a 14-day grid, so
--     a single checkout submission writes dozens of them. Logging each would
--     bury every other event on the screen, and the grid is already visible
--     in full from the loan detail screen.
--   * Emails actually sent — those have their own richer surface in
--     `email_log` and the "Sent email log" screen, including the rendered
--     body and the provider's error. Edits to the *templates* are logged
--     here, because those are config changes an admin made.

-- ── Table ────────────────────────────────────────────────────────────────

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- Mirrors the filter chips on the audit log screen.
  category text not null check (category in ('members', 'inventory', 'loans', 'emails')),
  -- Dotted event name, e.g. 'member.role_changed'. The UI maps these to
  -- badge labels; an unmapped one falls back to the raw key rather than
  -- rendering blank, so adding an action here can't break the screen.
  action text not null,
  -- Snapshots, not just the FK: an audit entry has to stay readable after
  -- the actor's profile is edited or deleted, which is exactly when it
  -- matters most. The FK is kept (nulled on delete) so entries can still be
  -- grouped by person while that person exists.
  actor_id uuid references profiles(id) on delete set null,
  actor_name text,
  actor_email text,
  entity_type text not null,
  entity_id uuid,
  -- For entities that aren't uuid-keyed: email_templates is keyed by its
  -- text `key` (e.g. 'return-reminder-one-week'), which entity_id can't
  -- hold. Null for everything else.
  entity_key text,
  -- Denormalized for the same reason as actor_name — the equipment or
  -- member this entry is about may be renamed or deleted later.
  entity_label text,
  summary text not null,
  -- Array of {field, from?, to?, hidden?}. `hidden` marks a field whose
  -- values are deliberately not copied into this table: 'pii' for personal
  -- data (phone, address, student ID) and 'content' for large bodies. The
  -- fact of the change is recorded either way.
  changes jsonb not null default '[]'::jsonb
);

create index if not exists audit_log_occurred_at_idx on audit_log (occurred_at desc);
create index if not exists audit_log_category_idx on audit_log (category);
create index if not exists audit_log_actor_id_idx on audit_log (actor_id);
create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id);

-- ── Row level security ───────────────────────────────────────────────────
-- Read-only, admin-only, append-only. There is no insert/update/delete
-- policy and no grant for them by design: rows arrive solely through the
-- SECURITY DEFINER trigger functions below, so nothing holding a user's JWT
-- can write, rewrite, or erase an entry. A log a user can edit isn't one.

alter table audit_log enable row level security;

drop policy if exists "Admins view the audit log" on audit_log;
create policy "Admins view the audit log"
  on audit_log for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select on public.audit_log to authenticated;

-- ── Helpers ──────────────────────────────────────────────────────────────

-- Diffs two row snapshots over an explicit field list. Explicit rather than
-- "every column" so that adding a column to a table can't start leaking its
-- values into the log by accident — a new field is logged only once someone
-- decides it should be.
--
-- p_hidden maps a field name to why its values are withheld ('pii' or
-- 'content'); such a field still produces an entry, just without from/to.
create or replace function public.audit_changes(
  p_old jsonb,
  p_new jsonb,
  p_fields text[],
  p_hidden jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_field text;
  v_old text;
  v_new text;
  v_hidden text;
  v_changes jsonb := '[]'::jsonb;
begin
  foreach v_field in array p_fields loop
    v_old := p_old ->> v_field;
    v_new := p_new ->> v_field;

    -- `is distinct from` rather than `<>` so a null on either side counts
    -- as a change; `<>` would return null and silently drop it.
    if v_old is distinct from v_new then
      v_hidden := p_hidden ->> v_field;
      if v_hidden is not null then
        v_changes := v_changes || jsonb_build_object('field', v_field, 'hidden', v_hidden);
      else
        v_changes := v_changes || jsonb_build_object('field', v_field, 'from', v_old, 'to', v_new);
      end if;
    end if;
  end loop;

  return v_changes;
end;
$$;

-- Writes one entry, resolving the acting user's name/email for the snapshot
-- columns. Fire-and-forget, like notify_email_event: a failure to log must
-- never roll back the write that triggered it — an admin being unable to
-- add a hardware item because the audit table hiccuped would be a worse
-- outcome than a missing line. Failures surface as a server warning.
create or replace function public.audit_write(
  p_category text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_label text,
  p_summary text,
  p_changes jsonb default '[]'::jsonb,
  p_entity_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
begin
  if v_actor_id is not null then
    select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), uw_email
      into v_actor_name, v_actor_email
      from profiles
     where id = v_actor_id;
  end if;

  insert into audit_log (
    category, action, actor_id, actor_name, actor_email,
    entity_type, entity_id, entity_key, entity_label, summary, changes
  )
  values (
    p_category, p_action, v_actor_id, v_actor_name, v_actor_email,
    p_entity_type, p_entity_id, p_entity_key, p_entity_label, p_summary,
    coalesce(p_changes, '[]'::jsonb)
  );
exception when others then
  raise warning 'audit_write failed for % %: %', p_action, p_entity_id, sqlerrm;
end;
$$;

-- Full name for a profile id, for summaries about someone other than the
-- actor. Falls back to a stable placeholder so a summary never reads as
-- "'s checkout request".
create or replace function public.audit_member_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
    'a member'
  )
  from profiles
  where id = p_profile_id;
$$;

-- ── profiles ─────────────────────────────────────────────────────────────

create or replace function public.audit_profile_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_write(
    'members', 'member.signed_up', 'member', new.id,
    trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')),
    trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')) || ' created an account'
  );
  return new;
end;
$$;

drop trigger if exists on_profile_created_audit on profiles;
create trigger on_profile_created_audit
  after insert on profiles
  for each row execute function public.audit_profile_created();

-- A role change and an ordinary profile edit can arrive in the same
-- UPDATE, and they're different events to an auditor, so this emits one
-- entry for each rather than merging them into a vague "profile changed".
create or replace function public.audit_profile_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  v_changes jsonb;
begin
  if old.role is distinct from new.role then
    perform public.audit_write(
      'members', 'member.role_changed', 'member', new.id, v_name,
      v_name || '''s role changed from ' || old.role || ' to ' || new.role,
      jsonb_build_array(jsonb_build_object('field', 'role', 'from', old.role, 'to', new.role))
    );
  end if;

  -- phone, student_id and address are withheld: this table is append-only
  -- and admin-readable forever, so copying a member's personal details into
  -- it on every edit would turn the audit log into a second, permanent
  -- store of data they can otherwise correct or have removed. That a field
  -- changed, and who changed it, is what an audit needs.
  v_changes := public.audit_changes(
    to_jsonb(old), to_jsonb(new),
    array['first_name', 'last_name', 'uw_email', 'discord', 'phone', 'student_id', 'address'],
    '{"phone": "pii", "student_id": "pii", "address": "pii"}'::jsonb
  );

  if jsonb_array_length(v_changes) > 0 then
    perform public.audit_write(
      'members', 'member.profile_updated', 'member', new.id, v_name,
      v_name || '''s profile details were updated',
      v_changes
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_updated_audit on profiles;
create trigger on_profile_updated_audit
  after update on profiles
  for each row execute function public.audit_profile_updated();

create or replace function public.audit_profile_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(old.first_name, '') || ' ' || coalesce(old.last_name, ''));
begin
  perform public.audit_write(
    'members', 'member.deleted', 'member', old.id, v_name,
    v_name || '''s account was removed'
  );
  return old;
end;
$$;

drop trigger if exists on_profile_deleted_audit on profiles;
create trigger on_profile_deleted_audit
  after delete on profiles
  for each row execute function public.audit_profile_deleted();

-- ── equipment ────────────────────────────────────────────────────────────

create or replace function public.audit_equipment_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_write(
    'inventory', 'equipment.created', 'equipment', new.id, new.name,
    new.name || ' was added to the inventory'
  );
  return new;
end;
$$;

drop trigger if exists on_equipment_created_audit on equipment;
create trigger on_equipment_created_audit
  after insert on equipment
  for each row execute function public.audit_equipment_created();

create or replace function public.audit_equipment_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changes jsonb;
begin
  -- updated_at is excluded: it changes on every write by definition, so
  -- including it would mean no update could ever be "no visible change"
  -- and every save would log an entry saying only that it was saved.
  v_changes := public.audit_changes(
    to_jsonb(old), to_jsonb(new),
    array['name', 'description', 'product_type', 'category', 'replacement_value',
          'quantity_total', 'documentation_url', 'image_url']
  );

  if jsonb_array_length(v_changes) = 0 then
    return new;
  end if;

  perform public.audit_write(
    'inventory', 'equipment.updated', 'equipment', new.id, new.name,
    new.name || ' was updated in the inventory',
    v_changes
  );
  return new;
end;
$$;

drop trigger if exists on_equipment_updated_audit on equipment;
create trigger on_equipment_updated_audit
  after update on equipment
  for each row execute function public.audit_equipment_updated();

create or replace function public.audit_equipment_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_write(
    'inventory', 'equipment.deleted', 'equipment', old.id, old.name,
    old.name || ' was removed from the inventory'
  );
  return old;
end;
$$;

drop trigger if exists on_equipment_deleted_audit on equipment;
create trigger on_equipment_deleted_audit
  after delete on equipment
  for each row execute function public.audit_equipment_deleted();

-- ── equipment_units ──────────────────────────────────────────────────────
-- The product name is looked up rather than carried, and coalesced: when a
-- product is deleted, its units cascade away in the same transaction, and
-- by the time this runs the equipment row is already gone.

create or replace function public.audit_equipment_unit_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product text := coalesce((select name from equipment where id = new.equipment_id), 'a deleted product');
begin
  perform public.audit_write(
    'inventory', 'equipment_unit.created', 'equipment_unit', new.id, new.serial_number,
    'Unit ' || new.serial_number || ' was added to ' || v_product
  );
  return new;
end;
$$;

drop trigger if exists on_equipment_unit_created_audit on equipment_units;
create trigger on_equipment_unit_created_audit
  after insert on equipment_units
  for each row execute function public.audit_equipment_unit_created();

create or replace function public.audit_equipment_unit_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product text := coalesce((select name from equipment where id = old.equipment_id), 'a deleted product');
begin
  perform public.audit_write(
    'inventory', 'equipment_unit.deleted', 'equipment_unit', old.id, old.serial_number,
    'Unit ' || old.serial_number || ' was removed from ' || v_product
  );
  return old;
end;
$$;

drop trigger if exists on_equipment_unit_deleted_audit on equipment_units;
create trigger on_equipment_unit_deleted_audit
  after delete on equipment_units
  for each row execute function public.audit_equipment_unit_deleted();

-- ── equipment_addons ─────────────────────────────────────────────────────

create or replace function public.audit_equipment_addon_linked()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_parent text := coalesce((select name from equipment where id = new.equipment_id), 'a deleted product');
  v_addon text := coalesce((select name from equipment where id = new.addon_equipment_id), 'a deleted product');
begin
  perform public.audit_write(
    'inventory', 'equipment_addon.linked', 'equipment', new.equipment_id, v_parent,
    v_addon || ' was linked to ' || v_parent || ' as ' ||
      (case when new.addon_type = 'required' then 'a required' else 'an optional' end) || ' add-on'
  );
  return new;
end;
$$;

drop trigger if exists on_equipment_addon_linked_audit on equipment_addons;
create trigger on_equipment_addon_linked_audit
  after insert on equipment_addons
  for each row execute function public.audit_equipment_addon_linked();

create or replace function public.audit_equipment_addon_unlinked()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_parent text := coalesce((select name from equipment where id = old.equipment_id), 'a deleted product');
  v_addon text := coalesce((select name from equipment where id = old.addon_equipment_id), 'a deleted product');
begin
  perform public.audit_write(
    'inventory', 'equipment_addon.unlinked', 'equipment', old.equipment_id, v_parent,
    v_addon || ' is no longer ' ||
      (case when old.addon_type = 'required' then 'a required' else 'an optional' end) ||
      ' add-on of ' || v_parent
  );
  return old;
end;
$$;

drop trigger if exists on_equipment_addon_unlinked_audit on equipment_addons;
create trigger on_equipment_addon_unlinked_audit
  after delete on equipment_addons
  for each row execute function public.audit_equipment_addon_unlinked();

-- ── loan_requests ────────────────────────────────────────────────────────

create or replace function public.audit_loan_request_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member text := public.audit_member_name(new.user_id);
begin
  perform public.audit_write(
    'loans', 'loan_request.submitted', 'loan_request', new.id, v_member,
    v_member || ' submitted a checkout request'
  );
  return new;
end;
$$;

drop trigger if exists on_loan_request_submitted_audit on loan_requests;
create trigger on_loan_request_submitted_audit
  after insert on loan_requests
  for each row execute function public.audit_loan_request_submitted();

-- 'approved' is this app's handoff event, not a separate approval step —
-- see 20260906000000_email_templates.sql's note on the same transition.
create or replace function public.audit_loan_request_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member text := public.audit_member_name(new.user_id);
  v_action text;
  v_summary text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    v_action := 'loan_request.approved';
    v_summary := v_member || '''s checkout request was approved and handed off';
  elsif new.status = 'denied' then
    v_action := 'loan_request.denied';
    v_summary := v_member || '''s checkout request was denied';
  else
    v_action := 'loan_request.status_changed';
    v_summary := v_member || '''s checkout request moved to ' || new.status;
  end if;

  perform public.audit_write(
    'loans', v_action, 'loan_request', new.id, v_member, v_summary,
    public.audit_changes(to_jsonb(old), to_jsonb(new), array['status', 'review_note'])
  );
  return new;
end;
$$;

drop trigger if exists on_loan_request_reviewed_audit on loan_requests;
create trigger on_loan_request_reviewed_audit
  after update on loan_requests
  for each row execute function public.audit_loan_request_reviewed();

-- submitLoanRequest (src/lib/loanRequests.ts) deletes the request it just
-- created if any later step fails, so this also covers a rolled-back
-- submission — which is worth seeing in the log, not hiding.
create or replace function public.audit_loan_request_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member text := public.audit_member_name(old.user_id);
begin
  perform public.audit_write(
    'loans', 'loan_request.deleted', 'loan_request', old.id, v_member,
    v_member || '''s checkout request was deleted'
  );
  return old;
end;
$$;

drop trigger if exists on_loan_request_deleted_audit on loan_requests;
create trigger on_loan_request_deleted_audit
  after delete on loan_requests
  for each row execute function public.audit_loan_request_deleted();

-- ── loan_request_items ───────────────────────────────────────────────────

create or replace function public.audit_loan_item_label(p_equipment_id uuid, p_unit_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select name from equipment where id = p_equipment_id), 'a deleted product')
    || coalesce(' (' || (select serial_number from equipment_units where id = p_unit_id) || ')', '');
$$;

create or replace function public.audit_loan_item_requested()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member text := public.audit_member_name(
    (select user_id from loan_requests where id = new.loan_request_id)
  );
  v_label text := public.audit_loan_item_label(new.equipment_id, new.equipment_unit_id);
begin
  perform public.audit_write(
    'loans', 'loan_item.requested', 'loan_request_item', new.id, v_label,
    v_label || ' was requested by ' || v_member ||
      (case when new.item_role = 'primary' then '' else ' as an add-on' end)
  );
  return new;
end;
$$;

drop trigger if exists on_loan_item_requested_audit on loan_request_items;
create trigger on_loan_item_requested_audit
  after insert on loan_request_items
  for each row execute function public.audit_loan_item_requested();

-- The reminder_*_sent_at / overdue_admin_notified_at columns are outside
-- the diffed field list on purpose: send-scheduled-reminders stamps them
-- daily, and logging those would mean an entry per loan per reminder with
-- nothing an auditor can act on. The email itself is in the email log.
create or replace function public.audit_loan_item_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changes jsonb;
  v_label text := public.audit_loan_item_label(new.equipment_id, new.equipment_unit_id);
begin
  v_changes := public.audit_changes(
    to_jsonb(old), to_jsonb(new),
    array['equipment_unit_id', 'return_date', 'signed_agreement_path', 'item_role']
  );

  if jsonb_array_length(v_changes) = 0 then
    return new;
  end if;

  perform public.audit_write(
    'loans', 'loan_item.updated', 'loan_request_item', new.id, v_label,
    v_label || ' was updated on a checkout request',
    v_changes
  );
  return new;
end;
$$;

drop trigger if exists on_loan_item_updated_audit on loan_request_items;
create trigger on_loan_item_updated_audit
  after update on loan_request_items
  for each row execute function public.audit_loan_item_updated();

create or replace function public.audit_loan_item_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text := public.audit_loan_item_label(old.equipment_id, old.equipment_unit_id);
begin
  perform public.audit_write(
    'loans', 'loan_item.removed', 'loan_request_item', old.id, v_label,
    v_label || ' was removed from a checkout request'
  );
  return old;
end;
$$;

drop trigger if exists on_loan_item_removed_audit on loan_request_items;
create trigger on_loan_item_removed_audit
  after delete on loan_request_items
  for each row execute function public.audit_loan_item_removed();

-- ── email_templates ──────────────────────────────────────────────────────
-- Config an admin edits, so it belongs here even though the resulting sends
-- are logged separately in email_log.

create or replace function public.audit_email_template_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changes jsonb;
  v_action text;
  v_summary text;
begin
  -- `body` is the editor's text/chip segment array — potentially kilobytes
  -- of jsonb, and its before/after would dwarf every other entry on the
  -- screen. The template itself is the source of truth for its current
  -- content; the log records that an admin edited it.
  v_changes := public.audit_changes(
    to_jsonb(old), to_jsonb(new),
    array['subject', 'body', 'enabled', 'dynamic_fields', 'label'],
    '{"body": "content"}'::jsonb
  );

  if jsonb_array_length(v_changes) = 0 then
    return new;
  end if;

  -- Turning a template off silently stops real emails going out, so it
  -- reads as its own event rather than a generic edit.
  if old.enabled is distinct from new.enabled then
    v_action := case when new.enabled then 'email_template.enabled' else 'email_template.disabled' end;
    v_summary := 'The "' || new.label || '" email was turned ' ||
      (case when new.enabled then 'on' else 'off' end);
  else
    v_action := 'email_template.updated';
    v_summary := 'The "' || new.label || '" email template was edited';
  end if;

  perform public.audit_write(
    'emails', v_action, 'email_template', null, new.label, v_summary, v_changes, new.key
  );
  return new;
end;
$$;

drop trigger if exists on_email_template_updated_audit on email_templates;
create trigger on_email_template_updated_audit
  after update on email_templates
  for each row execute function public.audit_email_template_updated();

-- ── Retention ────────────────────────────────────────────────────────────
-- This table only grows, and unlike email_log it takes a row for every
-- write the app makes, not just every email — so it needs an upper bound or
-- it becomes the largest table in the database by a wide margin.
--
-- A year is the default because that's the horizon the questions an audit
-- log answers actually have ("who promoted this person", "when did this
-- unit disappear"); anything older is history nobody is reconstructing from
-- here. Change it by passing a different number of months to the scheduled
-- call below, and keep AUDIT_LOG_RETENTION_MONTHS in src/lib/auditLog.ts in
-- step — the screen tells admins what the policy is.

create or replace function public.prune_audit_log(p_keep_months integer default 12)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from audit_log where occurred_at < now() - make_interval(months => p_keep_months);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Scheduled rather than run inline on insert: pruning on every write would
-- put a delete in the path of every action in the app, to reclaim rows that
-- are a year old and in no hurry.
--
-- pg_cron is available on Supabase but not enabled by default, and it isn't
-- installed by this migration: enabling an extension is a project-level
-- decision, and getting it wrong here would fail the whole migration over
-- something optional. If it isn't on yet, everything else in this file still
-- applies and the log simply grows until you enable it — turn it on under
-- Database -> Extensions in the dashboard and re-run this file, which will
-- then pick it up and schedule the job.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled — audit_log retention was NOT scheduled. Enable pg_cron (Dashboard -> Database -> Extensions) and re-run this migration.';
    return;
  end if;

  -- Scheduling under a name that already exists replaces that job rather
  -- than adding a second one, so re-running this file stays idempotent.
  perform cron.schedule('prune-audit-log', '30 3 * * 0', 'select public.prune_audit_log(12)');
  raise notice 'Scheduled weekly audit_log pruning as job "prune-audit-log" (Sundays 03:30 UTC, keeping 12 months).';
exception when others then
  raise warning 'Could not schedule audit_log pruning: %. The audit log still works; it just will not be pruned.', sqlerrm;
end $$;

-- ── Function privileges ──────────────────────────────────────────────────
-- Postgres grants EXECUTE on a new function to PUBLIC, and Supabase's
-- default privileges additionally grant it to anon and authenticated. Left
-- alone, that would hand every signed-in user a SECURITY DEFINER way to
-- write arbitrary rows into audit_log (audit_write), read any member's name
-- past RLS (audit_member_name, audit_loan_item_label), or delete a year of
-- history (prune_audit_log) — defeating the point of the table's
-- write-nothing policy set. These are internal plumbing; nothing holding a
-- user's JWT should be able to call them.
--
-- The trigger functions above don't need the same treatment: Postgres
-- refuses to execute a function returning `trigger` outside a trigger, so
-- being able to name one buys a caller nothing. The owner (postgres), which
-- is what the SECURITY DEFINER triggers run as, is unaffected by these
-- revokes.
do $$
declare
  v_function text;
  v_role text;
begin
  foreach v_function in array array[
    'public.audit_write(text, text, text, uuid, text, text, jsonb, text)',
    'public.audit_changes(jsonb, jsonb, text[], jsonb)',
    'public.audit_member_name(uuid)',
    'public.audit_loan_item_label(uuid, uuid)',
    'public.prune_audit_log(integer)'
  ] loop
    execute format('revoke all on function %s from public', v_function);

    -- Guarded so this file still applies on a plain Postgres (a local test
    -- database, say), where Supabase's roles don't exist.
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_function, v_role);
      end if;
    end loop;
  end loop;
end $$;
