-- Putting a unit on hold: keeping a physical unit out of circulation without
-- deleting it — it's being repaired, kept back for a demo, waiting on a
-- missing cable. Until now the only way to stop members requesting a unit
-- was to delete it, which also throws away its serial and its history.
--
-- A hold is a fact about the unit, not about a loan, so it lives on
-- equipment_units. It feeds the same "is this unit free?" question
-- 20260926010000_unit_reservation.sql answers for loans: a held unit is not
-- counted in the "N available" members see, is never offered by
-- available_equipment_units, and can't be attached to a new request.
--
-- Only a free unit can be put on hold. A unit already on someone's request
-- belongs to that request; the way to stop it going out is to cancel the
-- request, not to hide the unit underneath it.
--
-- Safe to re-run.

alter table equipment_units
  add column if not exists on_hold_at timestamptz,
  add column if not exists on_hold_by uuid;

-- Same on-delete behaviour as the other "which admin did this" columns
-- (20260927000000_profile_delete_fk_cleanup.sql).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_units_on_hold_by_fkey') then
    alter table equipment_units
      add constraint equipment_units_on_hold_by_fkey
      foreign key (on_hold_by) references public.profiles(id) on delete set null;
  end if;
end $$;

-- ── Availability ─────────────────────────────────────────────────────────
-- Both redefined from 20260926010000 with one added condition each. Kept
-- separate from equipment_unit_is_held on purpose: that function answers
-- "is a loan holding this?", which the hold guard below needs to ask on its
-- own.

create or replace function public.available_equipment_units(p_equipment_id uuid)
returns setof equipment_units language sql security definer set search_path = public as $$
  select u.*
  from equipment_units u
  where u.equipment_id = p_equipment_id
    and u.on_hold_at is null
    and not public.equipment_unit_is_held(u.id)
  order by u.serial_number;
$$;

create or replace function public.equipment_availability()
returns table (equipment_id uuid, available integer) language sql security definer set search_path = public as $$
  select e.id,
         (
           select count(*)::int
           from equipment_units u
           where u.equipment_id = e.id
             and u.on_hold_at is null
             and not public.equipment_unit_is_held(u.id)
         )
  from equipment e
  where e.product_type = 'hardware';
$$;

-- ── Guard: no new request on a held unit ────────────────────────────────
-- Redefined from 20260926010000. A member who opened the checkout before
-- the hold went on still has that unit's id in their browser, and would
-- otherwise submit straight past the availability count. Raised as the same
-- 'unit_unavailable' the app already turns into "no units available".

create or replace function public.guard_loan_item_unit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.equipment_unit_id is null then
    return new;
  end if;

  -- Re-saving an item with the unit it already has (an admin editing some
  -- other field, or a hand-off confirming the scanned serial) is not a claim.
  if tg_op = 'UPDATE' and new.equipment_unit_id is not distinct from old.equipment_unit_id then
    return new;
  end if;

  perform 1 from equipment_units where id = new.equipment_unit_id for update;

  if exists (select 1 from equipment_units where id = new.equipment_unit_id and on_hold_at is not null) then
    raise exception 'unit_unavailable' using errcode = 'P0001';
  end if;

  if public.equipment_unit_is_held(new.equipment_unit_id, new.id) then
    raise exception 'unit_unavailable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── Guard: only a free unit goes on hold ────────────────────────────────
-- The UI only offers hold on an available unit, but a member can request it
-- between the screen loading and the click. The UPDATE has already locked
-- this unit row, and guard_loan_item_unit locks the same row before it
-- claims a unit, so the two can't both win.
--
-- Also stamps who and when, so neither is trusted to the client.

create or replace function public.guard_equipment_unit_hold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.on_hold_at is null and new.on_hold_at is not null then
    if public.equipment_unit_is_held(new.id) then
      raise exception 'unit_in_use' using errcode = 'P0001';
    end if;
    new.on_hold_at := now();
    new.on_hold_by := auth.uid();
  elsif new.on_hold_at is null then
    new.on_hold_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_equipment_unit_hold on equipment_units;
create trigger guard_equipment_unit_hold
  before update of on_hold_at on equipment_units
  for each row execute function public.guard_equipment_unit_hold();

-- ── Audit ────────────────────────────────────────────────────────────────
-- Units were only audited on add and remove (20260921000000). A hold is the
-- kind of thing someone later asks "who did this and when?" about.

create or replace function public.audit_equipment_unit_hold()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_product text := coalesce((select name from equipment where id = new.equipment_id), 'a deleted product');
begin
  if old.on_hold_at is null and new.on_hold_at is not null then
    perform public.audit_write(
      'inventory', 'equipment_unit.held', 'equipment_unit', new.id, new.serial_number,
      'Unit ' || new.serial_number || ' of ' || v_product || ' was put on hold'
    );
  elsif old.on_hold_at is not null and new.on_hold_at is null then
    perform public.audit_write(
      'inventory', 'equipment_unit.released', 'equipment_unit', new.id, new.serial_number,
      'Unit ' || new.serial_number || ' of ' || v_product || ' was taken off hold'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_equipment_unit_hold_audit on equipment_units;
create trigger on_equipment_unit_hold_audit
  after update of on_hold_at on equipment_units
  for each row execute function public.audit_equipment_unit_hold();
