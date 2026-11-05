-- Project-group membership, shown to admins on the members screens.
--
-- Each SynapTech project group keeps a Google Sheet (all of them in one
-- Drive folder) with a members table whose email column lists everyone in
-- the group. The sync-member-groups Edge Function reads every sheet, looks
-- each profile's uw_email up in them, and writes:
--   project_group       — the group's name, or null for "None"
--   project_group_size  — how many emails that group's sheet lists (1 if none)
-- It runs from the admin "Sync groups" button and nightly from pg_cron.
--
-- Members never see these: no member screen reads them, and
-- 20261104000000_profiles_column_grants.sql gives `authenticated` no write
-- grant on them, so only the service role (the function) sets them.
--
-- Requires 20261104000000 (column grants) and the Vault secrets from
-- 20260917000000_email_trigger_vault_secrets.sql (edge_functions_url,
-- service_role_key). Safe to re-run.

-- ── Columns ─────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists project_group text;
alter table public.profiles add column if not exists project_group_size integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_project_group_size_positive') then
    alter table public.profiles
      add constraint profiles_project_group_size_positive check (project_group_size >= 1);
  end if;
end;
$$;

-- ── Sync history ────────────────────────────────────────────────────────
-- One row per sync attempt: backs "Last synced …" on the members screen
-- and keeps the warnings (a sheet with no email column, a member listed in
-- two groups) somewhere an admin can read them.

create table if not exists public.member_group_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  trigger text not null check (trigger in ('manual', 'cron')),
  triggered_by uuid references public.profiles(id) on delete set null,
  sheets_scanned integer,
  members_matched integer,
  warnings jsonb not null default '[]'::jsonb,
  error text
);

create index if not exists member_group_sync_runs_started_at_idx
  on public.member_group_sync_runs (started_at desc);

-- At most one run in flight. The function inserts its row first; a second
-- caller (a double click, or the button during the nightly run) hits this
-- and gets a 409 instead of two syncs racing to write the same profiles.
create unique index if not exists member_group_sync_runs_one_running
  on public.member_group_sync_runs ((true))
  where finished_at is null;

alter table public.member_group_sync_runs enable row level security;

drop policy if exists "Admins read group sync runs" on public.member_group_sync_runs;
create policy "Admins read group sync runs"
  on public.member_group_sync_runs for select
  to authenticated
  using (public.is_admin());

revoke all on public.member_group_sync_runs from anon, authenticated;
grant select on public.member_group_sync_runs to authenticated;
grant all on public.member_group_sync_runs to service_role;

-- ── Audit ───────────────────────────────────────────────────────────────
-- Redefines audit_profile_updated from 20260921000000_audit_log.sql with
-- one addition: a group change gets its own entry. The function only
-- writes profiles whose group actually changed, so this is one line per
-- real move, not one per member per night. Group name and size aren't
-- personal details, so they keep a full before/after.

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

  v_changes := public.audit_changes(
    to_jsonb(old), to_jsonb(new),
    array['project_group', 'project_group_size'],
    '{}'::jsonb
  );

  if jsonb_array_length(v_changes) > 0 then
    perform public.audit_write(
      'members', 'member.group_changed', 'member', new.id, v_name,
      case
        when new.project_group is null then v_name || ' is no longer in a project group'
        when old.project_group is distinct from new.project_group then v_name || ' is now in ' || new.project_group
        else v_name || '''s project group changed size'
      end,
      v_changes
    );
  end if;

  return new;
end;
$$;

-- ── Nightly sync ────────────────────────────────────────────────────────
-- Called by pg_cron. Presents the project secret key on `apikey`, which is
-- what the function's withSupabase({ auth: ['user', 'secret'] }) checks for
-- a non-user caller. Silently no-ops until both Vault secrets exist, the
-- same as notify_email_event.

create or replace function public.trigger_member_group_sync()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise notice 'trigger_member_group_sync: Vault secrets edge_functions_url / service_role_key are not set';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/sync-member-groups',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

-- Not callable through the API: starting a sync is the button's job, and
-- the button goes through the function's own admin check.
revoke all on function public.trigger_member_group_sync() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled — the nightly project-group sync was NOT scheduled. Enable pg_cron (Dashboard -> Database -> Extensions) and re-run this migration. The admin "Sync groups" button works either way.';
    return;
  end if;

  -- 09:15 UTC is 01:15/02:15 in Seattle, depending on daylight saving.
  perform cron.schedule('sync-member-groups', '15 9 * * *', 'select public.trigger_member_group_sync()');
end;
$$;
