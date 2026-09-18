-- Public bucket for images referenced *inside* sent emails (the brand
-- logo in the signature, for now). Separate from equipment-images: that
-- bucket is user-facing product photos with admin-only writes tied to the
-- inventory flow; this one is app-internal branding that only the email
-- pipeline's build step touches. Public read is required regardless of
-- which bucket holds it — the recipient's mail client (Gmail, Outlook,
-- etc.) fetches <img> URLs anonymously, with no Supabase auth of any kind.

insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to email assets" on storage.objects;
create policy "Public read access to email assets"
  on storage.objects for select
  to public
  using (bucket_id = 'email-assets');

drop policy if exists "Admins upload email assets" on storage.objects;
create policy "Admins upload email assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'email-assets'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Admins update email assets" on storage.objects;
create policy "Admins update email assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'email-assets'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Admins delete email assets" on storage.objects;
create policy "Admins delete email assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'email-assets'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
