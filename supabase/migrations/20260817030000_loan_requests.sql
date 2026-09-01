-- Checkout submissions ("loan requests"): a member bundles one primary
-- piece of equipment plus any optional/required add-ons into a single
-- request, picks a return date and uploads a signed agreement per hardware
-- item, and submits a shared pickup-availability schedule. An admin then
-- approves or denies the whole request.
--
-- Three tables:
--   loan_requests            — one row per checkout submission (status lives here)
--   loan_request_items       — one row per equipment item in the request
--   loan_request_availability — one row per 14-day/hourly slot the member marked free
--
-- `profiles` and `equipment`/`equipment_units` already exist (see
-- 20260817000000_equipment_inventory.sql) and are only referenced here.

-- ── loan_requests ────────────────────────────────────────────────────────

create table if not exists loan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  review_note text,
  updated_at timestamptz not null default now()
);

create index if not exists loan_requests_user_id_idx on loan_requests (user_id);
create index if not exists loan_requests_status_idx on loan_requests (status);

-- ── loan_request_items ───────────────────────────────────────────────────
-- One row per equipment item bundled into the request — the primary item
-- plus any optional/required add-ons, each with its own return date
-- (hardware only; null for consumables) and its own signed agreement.
-- `equipment_unit_id` records which physical serial was offered/reserved;
-- there's no concurrency-safe reservation system yet (see
-- fetchAvailableSerialNumber's docs), so this is set at submission time
-- from whatever the client saw as available and may be reassigned by an
-- admin on review.

create table if not exists loan_request_items (
  id uuid primary key default gen_random_uuid(),
  loan_request_id uuid not null references loan_requests(id) on delete cascade,
  equipment_id uuid not null references equipment(id),
  equipment_unit_id uuid references equipment_units(id),
  item_role text not null check (item_role in ('primary', 'optional_addon', 'required_addon')),
  return_date date,
  signed_agreement_path text,
  created_at timestamptz not null default now(),
  constraint loan_request_items_unique unique (loan_request_id, equipment_id)
);

create index if not exists loan_request_items_loan_request_id_idx on loan_request_items (loan_request_id);
create index if not exists loan_request_items_equipment_id_idx on loan_request_items (equipment_id);

-- ── loan_request_availability ────────────────────────────────────────────
-- One row per selected hour in the 14-day pickup availability grid.
-- `available_hour` is the 24-hour clock hour (8–22 in the current UI, but
-- not constrained to that range here in case the picker's window changes).

create table if not exists loan_request_availability (
  id uuid primary key default gen_random_uuid(),
  loan_request_id uuid not null references loan_requests(id) on delete cascade,
  available_date date not null,
  available_hour smallint not null check (available_hour between 0 and 23),
  created_at timestamptz not null default now(),
  constraint loan_request_availability_unique unique (loan_request_id, available_date, available_hour)
);

create index if not exists loan_request_availability_loan_request_id_idx
  on loan_request_availability (loan_request_id);

-- ── Row level security ───────────────────────────────────────────────────
-- Members can create and view their own requests (and everything attached
-- to them); they cannot edit or delete after submitting — a request is
-- immutable from the member's side once sent for review. Admins can view
-- everything and are the only ones who can update status/review fields or
-- reassign an item's serial.

alter table loan_requests enable row level security;
alter table loan_request_items enable row level security;
alter table loan_request_availability enable row level security;

drop policy if exists "Members view their own loan requests" on loan_requests;
create policy "Members view their own loan requests"
  on loan_requests for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Members create their own loan requests" on loan_requests;
create policy "Members create their own loan requests"
  on loan_requests for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Admins review loan requests" on loan_requests;
create policy "Admins review loan requests"
  on loan_requests for update
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Members view their own loan request items" on loan_request_items;
create policy "Members view their own loan request items"
  on loan_request_items for select
  to authenticated
  using (
    exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_items.loan_request_id
        and loan_requests.user_id = auth.uid()
    )
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Members create their own loan request items" on loan_request_items;
create policy "Members create their own loan request items"
  on loan_request_items for insert
  to authenticated
  with check (
    exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_items.loan_request_id
        and loan_requests.user_id = auth.uid()
    )
  );

drop policy if exists "Admins update loan request items" on loan_request_items;
create policy "Admins update loan request items"
  on loan_request_items for update
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Members view their own loan request availability" on loan_request_availability;
create policy "Members view their own loan request availability"
  on loan_request_availability for select
  to authenticated
  using (
    exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_availability.loan_request_id
        and loan_requests.user_id = auth.uid()
    )
    or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop policy if exists "Members create their own loan request availability" on loan_request_availability;
create policy "Members create their own loan request availability"
  on loan_request_availability for insert
  to authenticated
  with check (
    exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_availability.loan_request_id
        and loan_requests.user_id = auth.uid()
    )
  );

-- RLS policies alone aren't enough — Postgres also requires the base table
-- GRANT for `authenticated` before RLS is even evaluated, or every query
-- fails with 42501 regardless of correct policies (see
-- 20260817020000_equipment_grants.sql for the exact failure this caused
-- with equipment_addons). Granting all three tables up front here.

grant select, insert, update on public.loan_requests to authenticated;
grant select, insert, update on public.loan_request_items to authenticated;
grant select, insert on public.loan_request_availability to authenticated;

-- ── Storage: signed loan agreements ──────────────────────────────────────
-- Private bucket (signed PDFs carry student ID, address, phone) — objects
-- are stored at `${user_id}/${loan_request_id}/${equipment_id}.pdf`, so a
-- member can be scoped to their own folder and admins can read everything.

insert into storage.buckets (id, name, public)
values ('loan-agreements', 'loan-agreements', false)
on conflict (id) do nothing;

drop policy if exists "Members manage their own loan agreement uploads" on storage.objects;
create policy "Members manage their own loan agreement uploads"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'loan-agreements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Members read their own loan agreements" on storage.objects;
create policy "Members read their own loan agreements"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'loan-agreements'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
    )
  );
