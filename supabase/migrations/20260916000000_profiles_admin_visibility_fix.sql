-- The admin "View registered members" page reads every row of `profiles`,
-- but an admin only ever sees their own row. The policy meant to allow this,
-- added in 20260817040000_admin_profile_visibility.sql, cannot work as
-- written:
--
--   using (exists (select 1 from profiles p
--                  where p.id = auth.uid() and p.role = 'admin'))
--
-- That is a policy *on* `profiles` whose condition selects *from* `profiles`.
-- Postgres applies row-level security to that inner reference as well, and
-- the set of policies it applies includes this one — so evaluating it raises
-- "infinite recursion detected in policy for relation profiles" (42P17).
-- That migration's comment assumed the inner subquery would resolve through
-- the pre-existing self-read policy alone; it does not. Permissive policies
-- are OR'd together, and the inner read sees all of them.
--
-- The fix is to resolve the caller's role outside of RLS. A SECURITY DEFINER
-- function executes as its owner (the `postgres` role that owns `profiles`,
-- when this migration is run from the SQL editor or the CLI), and a table's
-- owner is not subject to its policies, so the lookup inside the function
-- bypasses RLS entirely. Nothing in it consults a policy, so there is no
-- recursion to detect.
--
-- The function is deliberately narrow: it takes a user id and returns a
-- boolean. It exposes no profile data, so being able to call it grants
-- nothing beyond "is this id an admin".

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
-- Pinned so the body cannot be redirected at a shadowing `profiles` in a
-- schema the caller controls.
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- Both policies are recreated in terms of the function. They stay additive:
-- the pre-existing self-read/self-write policies on `profiles` are left
-- untouched, so a member keeps access to their own row either way.

drop policy if exists "Admins view all profiles" on profiles;
create policy "Admins view all profiles"
  on profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins update profiles" on profiles;
create policy "Admins update profiles"
  on profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Table-level grants, for the same reason as
-- 20260817020000_equipment_grants.sql: a policy only filters rows within a
-- privilege that has already been granted. Both are almost certainly present
-- already (self-read and self-edit both work today) — this is a no-op then.
grant select, update on public.profiles to authenticated;
