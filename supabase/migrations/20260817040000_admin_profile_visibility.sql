-- Admins need to see every member's name when reviewing hardware loan
-- requests on the admin "Hardware loans" page. `profiles` already exists
-- (see 20260817000000_equipment_inventory.sql's note on pre-existing
-- tables) with a self-read policy that only lets a user read their own
-- row — this adds an additional, additive policy for admins without
-- touching whatever self-read policy is already in place. The inner
-- subquery resolves via that existing self-read policy for the admin's
-- own row, so this doesn't recurse.

drop policy if exists "Admins view all profiles" on profiles;
create policy "Admins view all profiles"
  on profiles for select
  to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
