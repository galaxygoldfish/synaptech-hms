-- A member can be in more than one project group. Replaces the single
-- project_group / project_group_size pair from 20261104010000 with
--
--   project_groups jsonb  — [{"name": "Mind Games", "size": 5}, …], largest
--                           group first; [] means "None".
--
-- Written only by the sync-member-groups function, like the columns it
-- replaces: authenticated has column-level grants on profiles
-- (20261104000000), and this column gets none.
--
-- Apply this, then redeploy sync-member-groups — the previous deploy writes
-- the old columns and fails (changing nothing) until it's replaced.
-- Safe to re-run.

alter table public.profiles
  add column if not exists project_groups jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_project_groups_is_array') then
    alter table public.profiles
      add constraint profiles_project_groups_is_array check (jsonb_typeof(project_groups) = 'array');
  end if;
end;
$$;

-- Carry today's single group across so nobody shows "None" before the next
-- sync. Skipped once the old columns are gone (a re-run).
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'project_group'
  ) then
    execute $sql$
      update public.profiles
         set project_groups = jsonb_build_array(jsonb_build_object('name', project_group, 'size', project_group_size))
       where project_group is not null and project_groups = '[]'::jsonb
    $sql$;
  end if;
end;
$$;

-- ── Audit ───────────────────────────────────────────────────────────────
-- Same as 20261104010000's version except the group entry, which now
-- compares the lists and records them as readable text ("Mind Games (5),
-- Stress Test Gaming (4)") so the audit screen can show the before/after.

create or replace function public.audit_profile_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  v_changes jsonb;
  v_old_groups text;
  v_new_groups text;
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

  if old.project_groups is distinct from new.project_groups then
    select coalesce(string_agg((g ->> 'name') || ' (' || (g ->> 'size') || ')', ', ' order by ord), 'None')
      into v_old_groups
      from jsonb_array_elements(old.project_groups) with ordinality as t(g, ord);
    select coalesce(string_agg((g ->> 'name') || ' (' || (g ->> 'size') || ')', ', ' order by ord), 'None')
      into v_new_groups
      from jsonb_array_elements(new.project_groups) with ordinality as t(g, ord);

    perform public.audit_write(
      'members', 'member.group_changed', 'member', new.id, v_name,
      case
        when jsonb_array_length(new.project_groups) = 0 then v_name || ' is no longer in a project group'
        else v_name || '''s project groups are now ' || v_new_groups
      end,
      jsonb_build_array(jsonb_build_object('field', 'project_groups', 'from', v_old_groups, 'to', v_new_groups))
    );
  end if;

  return new;
end;
$$;

-- ── Retire the single-group columns ─────────────────────────────────────

alter table public.profiles drop constraint if exists profiles_project_group_size_positive;
alter table public.profiles drop column if exists project_group;
alter table public.profiles drop column if exists project_group_size;
