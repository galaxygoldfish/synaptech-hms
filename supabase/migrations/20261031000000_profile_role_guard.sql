-- Members could promote themselves: the owner-update policy on profiles
-- doesn't restrict columns, and enforce_member_role only runs on insert.
-- Refuse any role change unless the caller is already an admin. No signed-in
-- user (the SQL editor, a service-role script) is still allowed, which is how
-- the first admin is promoted.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin(auth.uid()) then
    raise exception 'Only an admin can change a member''s role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role_change on public.profiles;
create trigger guard_profile_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role_change();
