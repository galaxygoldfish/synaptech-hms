-- Inventory audits: the record of someone standing in the hardware storage
-- facility scanning every unit on the shelf, and what that scan said about
-- the state of the inventory. Backs the admin "Perform inventory audit"
-- screen (/adminHome/inventory/audit,
-- src/components/admin-dashboard/InventoryAudit.tsx).
--
-- An audit is a SNAPSHOT, not a live query. That is the whole reason these
-- tables exist rather than the report being recomputed on demand: the
-- interesting question about a three-month-old audit is "what did we find
-- that day", and recomputing it against today's inventory would answer a
-- different question every time it was opened — and would answer nothing at
-- all for a unit that has since been deleted. So the serial number, the
-- product name and the borrower's name are copied in, alongside the foreign
-- keys, for the same reason audit_log snapshots its actor.
--
-- Depends on 20260817000000_equipment_inventory.sql (equipment,
-- equipment_units), 20260817030000_loan_requests.sql (loan_request_items)
-- and 20260921000000_audit_log.sql (public.audit_write). Run those first.

-- ── inventory_audits ─────────────────────────────────────────────────────
-- One row per completed audit. The counts are denormalized from
-- inventory_audit_entries so the list screen can show a history without
-- reading every entry of every audit; they can't drift, because
-- record_inventory_audit below derives them from the same entries it
-- inserts, in one transaction, and nothing ever updates either table.

create table if not exists inventory_audits (
  id uuid primary key default gen_random_uuid(),
  performed_at timestamptz not null default now(),
  -- Snapshot + FK, as in audit_log: the report has to stay readable after
  -- the admin who ran it is renamed or removed, which is exactly when an
  -- old audit gets looked up.
  performed_by uuid references profiles(id) on delete set null,
  performed_by_name text,
  performed_by_email text,
  -- Optional free text the auditor typed on finishing: damage found, or
  -- anything about the count a number can't carry ("north shelf only").
  note text,
  -- Units the records said should have been physically present: total
  -- hardware units minus the ones out on an approved, unreturned loan.
  expected_count integer not null default 0,
  -- Of those, the ones actually scanned.
  confirmed_count integer not null default 0,
  -- Of those, the ones never scanned — the result that matters.
  missing_count integer not null default 0,
  -- Units the records said were out with a member, so their absence from
  -- the shelf is accounted for rather than a finding.
  checked_out_count integer not null default 0,
  -- Scanned even though the records said they were out on loan: either the
  -- return was never recorded, or the wrong unit went out.
  found_checked_out_count integer not null default 0,
  -- Barcodes read that match no unit in inventory at all.
  unrecognized_count integer not null default 0
);

create index if not exists inventory_audits_performed_at_idx
  on inventory_audits (performed_at desc);

-- ── inventory_audit_entries ──────────────────────────────────────────────
-- One row per unit the audit had something to say about, plus one per
-- unrecognised barcode. This is the itemised backing for the counts above:
-- which serials were missing, not just how many.

create table if not exists inventory_audit_entries (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references inventory_audits(id) on delete cascade,
  -- confirmed        — expected on the shelf, and scanned
  -- missing          — expected on the shelf, never scanned
  -- checked_out      — out on an approved loan, so rightly not on the shelf
  -- found_checked_out— out on an approved loan, yet scanned on the shelf
  -- unrecognized     — a barcode matching no unit in inventory
  status text not null check (
    status in ('confirmed', 'missing', 'checked_out', 'found_checked_out', 'unrecognized')
  ),
  -- Null for an unrecognised barcode, and nulled if the unit is later
  -- deleted — serial_number below is what the report actually renders.
  equipment_unit_id uuid references equipment_units(id) on delete set null,
  serial_number text not null,
  equipment_id uuid references equipment(id) on delete set null,
  equipment_name text,
  -- Who the records said had it, for the two checked-out statuses.
  member_name text,
  -- When the barcode was read, for the statuses that involved a scan.
  scanned_at timestamptz
);

create index if not exists inventory_audit_entries_audit_id_idx
  on inventory_audit_entries (audit_id);

create index if not exists inventory_audit_entries_unit_idx
  on inventory_audit_entries (equipment_unit_id);

-- ── Row level security ───────────────────────────────────────────────────
-- Admin-readable, and append-only in the same sense as audit_log: there is
-- no insert, update or delete policy and no such grant. Rows arrive solely
-- through record_inventory_audit below, so an audit can't be quietly
-- rewritten to say the shelf was full when it wasn't. An audit somebody can
-- edit after the fact isn't one.

alter table inventory_audits enable row level security;
alter table inventory_audit_entries enable row level security;

drop policy if exists "Admins view inventory audits" on inventory_audits;
create policy "Admins view inventory audits"
  on inventory_audits for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Admins view inventory audit entries" on inventory_audit_entries;
create policy "Admins view inventory audit entries"
  on inventory_audit_entries for select
  to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select on public.inventory_audits to authenticated;
grant select on public.inventory_audit_entries to authenticated;

-- ── Recording an audit ───────────────────────────────────────────────────
-- One function rather than two inserts from the browser, for three reasons:
-- the audit row and its entries land in a single transaction, so a dropped
-- connection can't leave a report with counts and no findings; the counts
-- are derived from the entries here instead of being sent by the client, so
-- they cannot disagree with them; and the tables need no insert grant at
-- all, keeping them append-only from a JWT holder's point of view.
--
-- p_entries is the array the scan screen built:
--   [{ status, serialNumber, equipmentUnitId?, equipmentId?, equipmentName?,
--      memberName?, scannedAt? }, …]
-- Unknown keys are ignored; a bad `status` fails the check constraint and
-- rolls the whole audit back, which is the right outcome — a partially
-- recorded audit is worse than a failed one.

create or replace function public.record_inventory_audit(
  p_entries jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_email text;
  v_audit_id uuid;
begin
  -- SECURITY DEFINER bypasses RLS, so the admin check that the tables'
  -- policies would otherwise have made has to happen explicitly here.
  if not exists (select 1 from profiles where id = v_actor_id and role = 'admin') then
    raise exception 'Only an administrator can record an inventory audit';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'record_inventory_audit expects a JSON array of entries';
  end if;

  select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), uw_email
    into v_actor_name, v_actor_email
    from profiles
   where id = v_actor_id;

  insert into inventory_audits (performed_by, performed_by_name, performed_by_email, note)
  values (v_actor_id, v_actor_name, v_actor_email, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_audit_id;

  insert into inventory_audit_entries (
    audit_id, status, equipment_unit_id, serial_number,
    equipment_id, equipment_name, member_name, scanned_at
  )
  select
    v_audit_id,
    entry->>'status',
    nullif(entry->>'equipmentUnitId', '')::uuid,
    coalesce(entry->>'serialNumber', ''),
    nullif(entry->>'equipmentId', '')::uuid,
    nullif(entry->>'equipmentName', ''),
    nullif(entry->>'memberName', ''),
    nullif(entry->>'scannedAt', '')::timestamptz
  from jsonb_array_elements(p_entries) as entry;

  update inventory_audits
     set confirmed_count         = counts.confirmed,
         missing_count           = counts.missing,
         checked_out_count       = counts.checked_out,
         found_checked_out_count = counts.found_checked_out,
         unrecognized_count      = counts.unrecognized,
         -- Expected on the shelf is exactly "confirmed or missing": every
         -- unit the records placed there either turned up or didn't.
         expected_count          = counts.confirmed + counts.missing
    from (
      select
        count(*) filter (where status = 'confirmed')         as confirmed,
        count(*) filter (where status = 'missing')           as missing,
        count(*) filter (where status = 'checked_out')       as checked_out,
        count(*) filter (where status = 'found_checked_out') as found_checked_out,
        count(*) filter (where status = 'unrecognized')      as unrecognized
      from inventory_audit_entries
      where audit_id = v_audit_id
    ) as counts
   where id = v_audit_id;

  return v_audit_id;
end;
$$;

grant execute on function public.record_inventory_audit(jsonb, text) to authenticated;

-- ── Audit log ────────────────────────────────────────────────────────────
-- An audit of the inventory is itself a change an admin made to the app's
-- records, so it appears on the App audit log alongside everything else,
-- summarised the way that screen reads best. Fire-and-forget, like every
-- other audit_write call: a failure here must not lose the audit.

create or replace function public.audit_inventory_audit_recorded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.audit_write(
    'inventory', 'inventory_audit.recorded', 'inventory_audit', new.id,
    'Inventory audit',
    format(
      'An inventory audit confirmed %s of %s units in stock, with %s missing',
      new.confirmed_count, new.expected_count, new.missing_count
    )
  );
  return new;
end;
$$;

-- AFTER UPDATE, not AFTER INSERT: the row is inserted with zeroed counts and
-- filled in by the same function a moment later, so an insert-time trigger
-- would log "confirmed 0 of 0". The update only ever happens once, inside
-- record_inventory_audit, because nothing else may write to this table.
drop trigger if exists on_inventory_audit_recorded on inventory_audits;
create trigger on_inventory_audit_recorded
  after update on inventory_audits
  for each row execute function public.audit_inventory_audit_recorded();

-- ── Function privileges ──────────────────────────────────────────────────
-- record_inventory_audit is meant to be called from the app and keeps its
-- grant above. audit_inventory_audit_recorded returns `trigger`, which
-- Postgres refuses to execute outside a trigger, so naming it buys a caller
-- nothing — the same reasoning as the trigger functions in
-- 20260921000000_audit_log.sql.
