-- Admins can promote/demote members from the "Member details" page's
-- "Change to member"/"Change to admin" button. The read-all policy added
-- in 20260817040000_admin_profile_visibility.sql only covers SELECT —
-- this adds the matching UPDATE policy.

drop policy if exists "Admins update profiles" on profiles;
create policy "Admins update profiles"
  on profiles for update
  to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
