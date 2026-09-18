-- Automated emails: persists what the "manage user/admin emails" and
-- "edit email template" admin screens (src/components/admin-dashboard/
-- ManageEmails.tsx, EditEmailTemplate.tsx) previously only mocked in
-- src/data/emailTemplates.ts, plus a log of what was actually sent and the
-- Postgres-side plumbing (pg_net triggers) that notifies the send-email
-- Edge Function when something worth emailing about happens.
--
-- Three pieces:
--   email_templates — one row per email type; subject/body/enabled are
--                      admin-editable from the UI. `body` is the same
--                      text/chip segment array the editor already builds
--                      (see EmailBodySegment in the old data file).
--   email_log        — one row per email actually sent, for the
--                       "Automated email log" nav item (data/actions.ts's
--                       'automated-email-log' — still a console.log
--                       placeholder as of this migration).
--   notify_email_event + per-table triggers — fire-and-forget HTTP calls
--                       (via pg_net) to the send-email Edge Function
--                       whenever a row this app already writes changes in
--                       a way one of the templates cares about. See the
--                       bottom of this file for exactly which templates
--                       have a trigger wired up and which don't yet.

-- ── email_templates ──────────────────────────────────────────────────────

create table if not exists email_templates (
  key text primary key,
  category text not null check (category in ('user', 'admin')),
  label text not null,
  -- Display order within a category — the list is a deliberate lifecycle
  -- sequence (request -> approve -> reminders -> return), not alphabetical.
  sort_order integer not null default 0,
  dynamic_fields text[] not null default '{}',
  subject text not null default '',
  body jsonb not null default '[]',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

-- ── email_log ─────────────────────────────────────────────────────────────

create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references email_templates(key),
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now()
);

create index if not exists email_log_template_key_idx on email_log (template_key);
create index if not exists email_log_sent_at_idx on email_log (sent_at desc);

-- ── Reminder idempotency ─────────────────────────────────────────────────
-- The scheduled reminder function (supabase/functions/send-scheduled-
-- reminders) runs daily and needs to know which reminders it's already
-- sent for a given loan item, or it would re-send the same "due in a week"
-- email every day for a week straight.

alter table loan_request_items add column if not exists reminder_one_week_sent_at timestamptz;
alter table loan_request_items add column if not exists reminder_due_date_sent_at timestamptz;
alter table loan_request_items add column if not exists reminder_past_due_sent_at timestamptz;
alter table loan_request_items add column if not exists overdue_admin_notified_at timestamptz;

-- ── Row level security ───────────────────────────────────────────────────
-- Admin-only config surface from the frontend's side — no insert/delete
-- policy since the template set is fixed (seeded below), not admin-
-- creatable. The Edge Functions use the service role key, which bypasses
-- RLS entirely, so they don't need a policy here at all.

alter table email_templates enable row level security;
alter table email_log enable row level security;

drop policy if exists "Admins view email templates" on email_templates;
create policy "Admins view email templates"
  on email_templates for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins update email templates" on email_templates;
create policy "Admins update email templates"
  on email_templates for update
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins view email log" on email_log;
create policy "Admins view email log"
  on email_log for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select, update on public.email_templates to authenticated;
grant select on public.email_log to authenticated;

-- ── Seed data ────────────────────────────────────────────────────────────
-- Ports src/data/emailTemplates.ts's USER_EMAIL_TEMPLATES/
-- ADMIN_EMAIL_TEMPLATES verbatim. Every subject starts blank and every body
-- starts empty except return-reminder-one-week (the one template with real
-- copy — see that file's history) — the rest are genuinely unwritten, not
-- placeholder content pretending to be final.

insert into email_templates (key, category, label, sort_order, dynamic_fields, subject, body) values
  ('account-creation-confirmation', 'user', 'Account creation confirmation', 0,
    array['user_name'], '', '[]'),
  ('checkout-request-confirmation', 'user', 'Checkout request confirmation', 1,
    array['user_name', 'hardware_name', 'hardware_serial', 'loan_start_date', 'loan_due_date'], '', '[]'),
  ('checkout-request-approval', 'user', 'Checkout request approval', 2,
    array['user_name', 'hardware_name', 'hardware_serial', 'loan_start_date', 'loan_due_date'], '', '[]'),
  ('return-reminder-one-week', 'user', 'Return reminder (1 week before)', 3,
    array['user_name', 'loan_due_date', 'loan_start_date', 'hardware_name', 'hardware_serial'], '',
    '[
      {"type": "text", "value": "Hello "},
      {"type": "chip", "field": "user_name"},
      {"type": "text", "value": ",\n\nYour hardware product "},
      {"type": "chip", "field": "hardware_name"},
      {"type": "text", "value": " with serial number "},
      {"type": "chip", "field": "hardware_serial"},
      {"type": "text", "value": " must be returned soon.\n\nAs agreed upon in your Hardware Loan Agreement with us, you must return this hardware product before "},
      {"type": "chip", "field": "loan_due_date"},
      {"type": "text", "value": ". Failure to return this item may result in disciplinary action as outlined in the Synaptech Hardware Checkout Policy."}
    ]'::jsonb),
  ('return-reminder-due-date', 'user', 'Return reminder (due date)', 4,
    array['user_name', 'loan_due_date', 'hardware_name', 'hardware_serial'], '', '[]'),
  ('return-reminder-past-due', 'user', 'Return reminder (past due)', 5,
    array['user_name', 'loan_due_date', 'hardware_name', 'hardware_serial'], '', '[]'),
  ('successful-return-confirmation', 'user', 'Successful return confirmation', 6,
    array['user_name', 'hardware_name', 'hardware_serial', 'return_date'], '', '[]'),
  ('successful-handoff-confirmation', 'user', 'Successful handoff confirmation', 7,
    array['user_name', 'hardware_name', 'hardware_serial', 'loan_due_date'], '', '[]'),
  ('account-permission-elevation', 'admin', 'Account permission elevation', 0,
    array['user_name', 'new_role'], '', '[]'),
  ('hardware-item-added', 'admin', 'Hardware item added to inventory', 1,
    array['hardware_name', 'admin_name'], '', '[]'),
  ('hardware-item-modified', 'admin', 'Hardware item modified in inventory', 2,
    array['hardware_name', 'admin_name'], '', '[]'),
  ('hardware-checkout-requested', 'admin', 'Hardware checkout requested', 3,
    array['user_name', 'hardware_name', 'hardware_serial'], '', '[]'),
  ('hardware-handed-off', 'admin', 'Hardware successfully handed off', 4,
    array['user_name', 'hardware_name', 'hardware_serial', 'admin_name'], '', '[]'),
  ('hardware-return-requested', 'admin', 'Hardware return requested', 5,
    array['user_name', 'hardware_name', 'hardware_serial'], '', '[]'),
  ('hardware-returned', 'admin', 'Hardware successfully returned', 6,
    array['user_name', 'hardware_name', 'hardware_serial', 'admin_name'], '', '[]'),
  ('hardware-item-overdue', 'admin', 'Hardware item overdue', 7,
    array['user_name', 'hardware_name', 'hardware_serial', 'loan_due_date'], '', '[]')
on conflict (key) do nothing;

-- ── Notify-on-write triggers ─────────────────────────────────────────────
-- Fire-and-forget: notify_email_event POSTs {event, recordId} to the
-- send-email Edge Function via pg_net and never raises — a notification
-- failure (or the Edge Function not being deployed/configured yet) must
-- never block the write that triggered it. It no-ops entirely until it's
-- configured (see this file's closing comment).
--
-- SUPERSEDED: the config mechanism described just below this comment —
-- `alter database postgres set app.settings.*` — turned out to need a
-- privilege the SQL editor's connection doesn't have, so it could never
-- actually be set. 20260917000000_email_trigger_vault_secrets.sql replaces
-- it with Supabase Vault, and 20260918000000_email_trigger_secret_key_header.sql
-- changes the outgoing auth header to match. Skip straight to those two
-- migrations (and README.md's "One-time setup") rather than following the
-- steps below — they're kept here only as a record of what this looked
-- like originally.
--
-- app.settings.edge_functions_url and app.settings.service_role_key are
-- NOT set by this migration — they contain a live secret and a
-- project-specific URL, neither of which belongs in committed SQL. Set
-- them once per environment:
--
--   alter database postgres set app.settings.edge_functions_url
--     = 'https://<project-ref>.functions.supabase.co';
--   alter database postgres set app.settings.service_role_key
--     = '<service-role-key-from-project-settings>';
--
-- (new connections only — reconnect or wait for the pooler to cycle).
-- See README.md's "Automated emails" section for the full setup, including
-- deploying the Edge Functions and scheduling send-scheduled-reminders.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_email_event(p_event text, p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := current_setting('app.settings.edge_functions_url', true);
  v_key text := current_setting('app.settings.service_role_key', true);
begin
  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('event', p_event, 'recordId', p_record_id)
  );
exception when others then
  raise warning 'notify_email_event failed for % %: %', p_event, p_record_id, sqlerrm;
end;
$$;

-- profiles: account creation, role elevation

create or replace function public.notify_profile_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_email_event('profile.created', new.id);
  return new;
end;
$$;

drop trigger if exists on_profile_created_notify_email on profiles;
create trigger on_profile_created_notify_email
  after insert on profiles
  for each row execute function public.notify_profile_created();

create or replace function public.notify_profile_role_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role then
    perform public.notify_email_event('profile.role_changed', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_role_changed_notify_email on profiles;
create trigger on_profile_role_changed_notify_email
  after update on profiles
  for each row execute function public.notify_profile_role_changed();

-- loan_request_items: checkout requested (primary item only — mirrors the
-- admin loan detail page, which also treats the primary item as "the"
-- item for a request)

create or replace function public.notify_loan_item_requested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.item_role = 'primary' then
    perform public.notify_email_event('loan_item.requested', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_item_requested_notify_email on loan_request_items;
create trigger on_loan_item_requested_notify_email
  after insert on loan_request_items
  for each row execute function public.notify_loan_item_requested();

-- loan_requests: status -> approved. There's no separate "approved but not
-- yet handed off" step in this app (see loanRequests.ts's bucketForLoanItem
-- — 'approved' already means checked out), so this is the handoff event,
-- not a distinct approval one.

create or replace function public.notify_loan_request_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status and new.status = 'approved' then
    perform public.notify_email_event('loan_request.approved', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_request_approved_notify_email on loan_requests;
create trigger on_loan_request_approved_notify_email
  after update on loan_requests
  for each row execute function public.notify_loan_request_approved();

-- equipment: added / modified

create or replace function public.notify_equipment_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_email_event('equipment.created', new.id);
  return new;
end;
$$;

drop trigger if exists on_equipment_created_notify_email on equipment;
create trigger on_equipment_created_notify_email
  after insert on equipment
  for each row execute function public.notify_equipment_created();

create or replace function public.notify_equipment_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_email_event('equipment.updated', new.id);
  return new;
end;
$$;

drop trigger if exists on_equipment_updated_notify_email on equipment;
create trigger on_equipment_updated_notify_email
  after update on equipment
  for each row execute function public.notify_equipment_updated();

-- ── What's NOT wired up yet ──────────────────────────────────────────────
-- checkout-request-approval, hardware-return-requested,
-- successful-return-confirmation, and hardware-returned have no trigger
-- above — there's no separate approval step and no return-request/return-
-- completion feature in the app yet for them to fire on (see LoanDetail.tsx
-- and loanRequests.ts's comments on the 'returns' bucket). They're still
-- editable from the admin UI, just dormant until those flows exist.
--
-- return-reminder-one-week/due-date/past-due and hardware-item-overdue
-- aren't triggers at all — they're computed daily from
-- loan_request_items.return_date by supabase/functions/send-scheduled-
-- reminders, which needs to be deployed and scheduled separately.
