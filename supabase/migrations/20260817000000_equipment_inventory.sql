-- Equipment inventory: products ("equipment"), individually-serialized
-- physical units of hardware products ("equipment_units"), and links from
-- one product to other existing products that act as its optional/required
-- add-ons ("equipment_addons").
--
-- Written defensively with `if not exists` / `add column if not exists`
-- since `equipment` and `equipment_units` already exist in the live
-- database (referenced by src/components/user-dashboard/api.ts) but this
-- repo has no prior migration history to confirm their exact shape.

-- ── equipment ────────────────────────────────────────────────────────────

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

alter table equipment add column if not exists description text;
alter table equipment add column if not exists product_type text not null default 'hardware';
alter table equipment add column if not exists replacement_value numeric(10, 2);
alter table equipment add column if not exists quantity_total integer not null default 0;
alter table equipment add column if not exists documentation_url text;
alter table equipment add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'equipment_product_type_check'
  ) then
    alter table equipment
      add constraint equipment_product_type_check
      check (product_type in ('hardware', 'consumable'));
  end if;
end $$;

-- ── equipment_units ──────────────────────────────────────────────────────
-- One row per physical hardware unit. Consumables aren't individually
-- serialized, so they never get rows here — quantity_total on `equipment`
-- is their stock count.

create table if not exists equipment_units (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  serial_number text not null,
  created_at timestamptz not null default now()
);

alter table equipment_units add column if not exists serial_number text;

create unique index if not exists equipment_units_serial_number_key
  on equipment_units (serial_number);

create index if not exists equipment_units_equipment_id_idx
  on equipment_units (equipment_id);

-- ── equipment_addons ─────────────────────────────────────────────────────
-- Self-referential link table: an "add-on" is just another existing
-- equipment product, associated with a parent product as optional or
-- required. No new equipment is created by an add-on link. The picker UI
-- for choosing an existing product isn't built yet — this table is ready
-- for when it is.

create table if not exists equipment_addons (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  addon_equipment_id uuid not null references equipment(id) on delete cascade,
  addon_type text not null check (addon_type in ('optional', 'required')),
  created_at timestamptz not null default now(),
  constraint equipment_addons_not_self check (equipment_id <> addon_equipment_id),
  constraint equipment_addons_unique unique (equipment_id, addon_equipment_id, addon_type)
);

create index if not exists equipment_addons_equipment_id_idx
  on equipment_addons (equipment_id);

-- ── Row level security ───────────────────────────────────────────────────
-- Any signed-in user (member or admin) can browse the catalog; only admins
-- can create/edit/remove products, units, or add-on links.

alter table equipment enable row level security;
alter table equipment_units enable row level security;
alter table equipment_addons enable row level security;

-- CREATE POLICY has no IF NOT EXISTS clause in Postgres, so drop-then-create
-- for idempotency instead.

drop policy if exists "Equipment is viewable by authenticated users" on equipment;
create policy "Equipment is viewable by authenticated users"
  on equipment for select
  to authenticated
  using (true);

drop policy if exists "Admins manage equipment" on equipment;
create policy "Admins manage equipment"
  on equipment for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Equipment units are viewable by authenticated users" on equipment_units;
create policy "Equipment units are viewable by authenticated users"
  on equipment_units for select
  to authenticated
  using (true);

drop policy if exists "Admins manage equipment units" on equipment_units;
create policy "Admins manage equipment units"
  on equipment_units for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Equipment addons are viewable by authenticated users" on equipment_addons;
create policy "Equipment addons are viewable by authenticated users"
  on equipment_addons for select
  to authenticated
  using (true);

drop policy if exists "Admins manage equipment addons" on equipment_addons;
create policy "Admins manage equipment addons"
  on equipment_addons for all
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ── Storage: equipment images ────────────────────────────────────────────
-- Public bucket so product photos can be shown app-wide without signed
-- URLs; only admins may upload/replace/delete.

insert into storage.buckets (id, name, public)
values ('equipment-images', 'equipment-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to equipment images" on storage.objects;
create policy "Public read access to equipment images"
  on storage.objects for select
  to public
  using (bucket_id = 'equipment-images');

drop policy if exists "Admins upload equipment images" on storage.objects;
create policy "Admins upload equipment images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'equipment-images'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Admins update equipment images" on storage.objects;
create policy "Admins update equipment images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'equipment-images'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Admins delete equipment images" on storage.objects;
create policy "Admins delete equipment images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'equipment-images'
    and exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
