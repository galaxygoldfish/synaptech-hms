-- Narrow what a signed-in user can write on profiles to the columns a
-- person actually edits, rather than "anything on a row RLS lets them
-- touch". Until now `authenticated` held table-wide insert/update, so the
-- only thing stopping a member from rewriting, say, their own uw_email was
-- that no screen offered it.
--
-- After this:
--   * insert  — the fields ProfileSetupPage sends (role is still forced to
--               'member' by enforce_member_role)
--   * update  — the editable personal fields, plus role (admins promote and
--               demote through the client; guard_profile_role_change in
--               20261031000000 refuses it for everyone else)
--   * uw_email is pinned to the account's verified sign-in address on
--     insert and can't be updated by a signed-in user at all, so anything
--     keyed on it (project-group matching, loan agreements) can trust it.
--
-- Columns added later (e.g. project_group in 20261104010000) get no grant
-- here, which is the point: they are written by the service role only.
--
-- The service role and the SQL editor bypass these grants. Safe to re-run.

revoke insert, update on public.profiles from anon, authenticated;

grant insert (id, first_name, last_name, phone, student_id, uw_email, address, discord)
  on public.profiles to authenticated;

grant update (first_name, last_name, phone, student_id, address, discord, role)
  on public.profiles to authenticated;

-- uw_email comes from auth.users, not from whatever the client sent. The
-- setup screen already shows it locked and pre-filled from the session, so
-- nothing changes for a member signing up.
create or replace function public.pin_profile_uw_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    return new;  -- service role / SQL editor: trusted as given
  end if;

  select email into v_email from auth.users where id = new.id;
  if v_email is not null then
    new.uw_email := v_email;
  end if;
  return new;
end;
$$;

revoke all on function public.pin_profile_uw_email() from public, anon, authenticated;

drop trigger if exists pin_profile_uw_email on public.profiles;
create trigger pin_profile_uw_email
  before insert on public.profiles
  for each row execute function public.pin_profile_uw_email();
