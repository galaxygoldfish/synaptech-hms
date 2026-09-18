-- One physical unit, one borrower at a time.
--
-- Until now the checkout flow offered every member the *first* unit by serial
-- (fetchAvailableEquipmentUnit), so two members requesting the same product
-- were both attached to the exact same serial. A unit is now "held" from the
-- moment it's attached to a request until it comes back:
--
--   held  =  a loan_request_items row for the unit, not yet returned
--            (returned_at is null), whose request is pending or approved.
--
-- A denied request releases its units; a returned item releases its unit.
-- Pending counts as held on purpose — the unit is spoken for even before an
-- admin has reviewed the request.
--
-- Members can only read their own loan_request_items (RLS), so "which units
-- are free?" can't be answered from the client. It's answered here, in
-- security-definer functions, and enforced by a trigger so two members
-- submitting at the same instant can't both win the same serial.

-- Deliberately VOLATILE (the default): the guard trigger waits on a row lock
-- and must then see the rows the winning transaction just committed, which a
-- STABLE function's snapshot would not.
create or replace function public.equipment_unit_is_held(p_unit_id uuid, p_ignore_item_id uuid default null)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1
    from loan_request_items i
    join loan_requests r on r.id = i.loan_request_id
    where i.equipment_unit_id = p_unit_id
      and i.returned_at is null
      and r.status in ('pending', 'approved')
      and (p_ignore_item_id is null or i.id <> p_ignore_item_id)
  );
$$;

-- The units of a product nobody is holding, in serial order.
create or replace function public.available_equipment_units(p_equipment_id uuid)
returns setof equipment_units language sql security definer set search_path = public as $$
  select u.*
  from equipment_units u
  where u.equipment_id = p_equipment_id
    and not public.equipment_unit_is_held(u.id)
  order by u.serial_number;
$$;

-- How many units of each hardware product are free, for the "N available"
-- counts members see. Consumables have no units and aren't listed.
create or replace function public.equipment_availability()
returns table (equipment_id uuid, available integer) language sql security definer set search_path = public as $$
  select e.id,
         (
           select count(*)::int
           from equipment_units u
           where u.equipment_id = e.id
             and not public.equipment_unit_is_held(u.id)
         )
  from equipment e
  where e.product_type = 'hardware';
$$;

-- ── Guard ────────────────────────────────────────────────────────────────
-- Refuses to attach a unit that's already held. Locking the unit row first
-- serialises concurrent attempts on the same serial: the second one waits,
-- then sees the first one's row and is refused.

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

  if public.equipment_unit_is_held(new.equipment_unit_id, new.id) then
    raise exception 'unit_unavailable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_loan_item_unit on loan_request_items;
create trigger guard_loan_item_unit
  before insert or update of equipment_unit_id on loan_request_items
  for each row execute function public.guard_loan_item_unit();

revoke all on function public.equipment_unit_is_held(uuid, uuid) from public;
revoke all on function public.available_equipment_units(uuid) from public;
revoke all on function public.equipment_availability() from public;
grant execute on function public.available_equipment_units(uuid) to authenticated;
grant execute on function public.equipment_availability() to authenticated;
