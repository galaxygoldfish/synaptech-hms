-- Switching the unit on a checkout request: an admin pointing a requested
-- item at a different unit of the same product before it's handed over (the
-- one the member was given failed inspection, or a different one is on the
-- desk). The app rewrites the serial in the member's signed agreement and
-- repoints the item in one update — see switchLoanItemUnit in
-- src/lib/loanRequests.ts.
--
-- Whether the new unit is free is already guard_loan_item_unit's job
-- (20261002010000_unit_hold.sql): it fires on any change of
-- equipment_unit_id, refuses a unit on hold or on another live request, and
-- takes the unit's row lock while it does. What it doesn't know is when a
-- change is allowed at all, which is this file.
--
-- Safe to re-run.

-- ── Guard: only before hand-off, only to the same product ───────────────
-- Admins can update loan_request_items freely under RLS, so this is the
-- only thing between a second client — or the SQL editor — and a loan
-- whose serial changes after the hardware is already with the member.
--
-- Attaching a unit to an item that had none isn't a switch and isn't
-- fenced here; nothing does that today, and fencing it would be guessing.

create or replace function public.guard_loan_item_unit_switch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if old.equipment_unit_id is null or new.equipment_unit_id is not distinct from old.equipment_unit_id then
    return new;
  end if;

  select status into v_status from loan_requests where id = new.loan_request_id;
  if v_status is distinct from 'pending' or new.returned_at is not null then
    raise exception 'unit_switch_closed' using errcode = 'P0001';
  end if;

  -- The item is a request for a product; a unit of something else would
  -- leave equipment_id and the serial disagreeing about what was lent.
  if new.equipment_unit_id is not null
     and not exists (
       select 1 from equipment_units where id = new.equipment_unit_id and equipment_id = new.equipment_id
     ) then
    raise exception 'unit_wrong_product' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_loan_item_unit_switch on loan_request_items;
create trigger guard_loan_item_unit_switch
  before update of equipment_unit_id on loan_request_items
  for each row execute function public.guard_loan_item_unit_switch();

-- ── Audit ────────────────────────────────────────────────────────────────
-- Redefines audit_loan_item_updated from 20260925000000 with one added
-- branch. Without it a switch would be logged as a generic "was updated"
-- whose changes are two unit UUIDs and two storage paths — true, but not
-- something an admin can read. The serials are snapshotted, like every
-- other audit row, so the entry still says what happened after either unit
-- is deleted. Everything else about the function is unchanged.

create or replace function public.audit_loan_item_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changes jsonb;
  v_label text := public.audit_loan_item_label(new.equipment_id, new.equipment_unit_id);
  v_old_serial text;
  v_new_serial text;
  v_member text;
begin
  if old.returned_at is null and new.returned_at is not null then
    perform public.audit_write(
      'loans', 'loan_item.returned', 'loan_request_item', new.id, v_label,
      v_label || ' was returned and checked back in'
    );
    return new;
  end if;

  if old.return_requested_at is null and new.return_requested_at is not null then
    perform public.audit_write(
      'loans', 'loan_item.return_requested', 'loan_request_item', new.id, v_label,
      v_label || ' — the borrower asked to return it'
    );
    return new;
  end if;

  if old.equipment_unit_id is not null and new.equipment_unit_id is distinct from old.equipment_unit_id then
    v_old_serial := coalesce((select serial_number from equipment_units where id = old.equipment_unit_id), 'a deleted unit');
    v_new_serial := coalesce((select serial_number from equipment_units where id = new.equipment_unit_id), 'no unit');
    v_member := public.audit_member_name((select user_id from loan_requests where id = new.loan_request_id));
    perform public.audit_write(
      'loans', 'loan_item.unit_switched', 'loan_request_item', new.id, v_label,
      v_member || '''s ' || coalesce((select name from equipment where id = new.equipment_id), 'a deleted product')
        || ' request was switched from ' || v_old_serial || ' to ' || v_new_serial,
      jsonb_build_array(jsonb_build_object('field', 'serial_number', 'from', v_old_serial, 'to', v_new_serial))
    );
    return new;
  end if;

  v_changes := public.audit_changes(
    to_jsonb(old), to_jsonb(new),
    array['equipment_unit_id', 'return_date', 'signed_agreement_path', 'item_role', 'returned_at']
  );

  if jsonb_array_length(v_changes) = 0 then
    return new;
  end if;

  perform public.audit_write(
    'loans', 'loan_item.updated', 'loan_request_item', new.id, v_label,
    v_label || ' was updated on a checkout request',
    v_changes
  );
  return new;
end;
$$;
