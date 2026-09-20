-- Per-admin, per-template CC overrides for the "CC" subsection of the admin
-- "edit email template" screen's Recipients section (EditEmailTemplate.tsx).
-- Lets an admin be added as a CC on any template. Who the direct ("to")
-- recipient is isn't stored here at all — it's fixed by the code that
-- dispatches each email (see the `recipient` copy on
-- EmailTemplateDescription in src/lib/emailTemplates.ts) and shown as
-- read-only text next to this CC list, not admin-configurable.
--
-- A row only exists once an admin's CC setting for a given template has
-- actually been touched from the UI; no row at all means "off" (see
-- fetchTemplateRecipients in src/lib/emailTemplates.ts and
-- fetchAdminCcOverrides in supabase/functions/_shared/db.ts, which both
-- implement that same default). Both always start from the *current* set
-- of profiles.role = 'admin' rather than a snapshot, so a newly promoted
-- admin shows up with CC off and a demoted admin drops out immediately —
-- this table only ever needs to remember exceptions.

create table if not exists email_template_recipient_overrides (
  template_key text not null references email_templates(key) on delete cascade,
  admin_id uuid not null references profiles(id) on delete cascade,
  cc_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  primary key (template_key, admin_id)
);

-- ── Row level security ───────────────────────────────────────────────────
-- Same admin-only surface as email_templates, but this table is genuinely
-- admin-writable (not a fixed seed set), so unlike email_templates it needs
-- an insert policy too. No delete policy — settings are always upserted,
-- never removed, so there's nothing that needs to delete a row.

alter table email_template_recipient_overrides enable row level security;

drop policy if exists "Admins view email recipient overrides" on email_template_recipient_overrides;
create policy "Admins view email recipient overrides"
  on email_template_recipient_overrides for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins insert email recipient overrides" on email_template_recipient_overrides;
create policy "Admins insert email recipient overrides"
  on email_template_recipient_overrides for insert
  to authenticated
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins update email recipient overrides" on email_template_recipient_overrides;
create policy "Admins update email recipient overrides"
  on email_template_recipient_overrides for update
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select, insert, update on public.email_template_recipient_overrides to authenticated;
