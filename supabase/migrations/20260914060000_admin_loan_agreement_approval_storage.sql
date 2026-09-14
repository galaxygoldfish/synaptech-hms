-- Admins need to upload the stamped copy of a member's signed agreement
-- back into that member's private agreement folder.
drop policy if exists "Admins upload approved loan agreements" on storage.objects;
create policy "Admins upload approved loan agreements"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'loan-agreements'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Admins update approved loan agreements" on storage.objects;
create policy "Admins update approved loan agreements"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'loan-agreements'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  )
  with check (
    bucket_id = 'loan-agreements'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );