-- The two things a member can do to their own loan from "My hardware loans":
-- call off a checkout request they haven't been handed yet, and ask to give
-- back hardware they're holding.
--
-- Until now a member could submit a request and then only wait: the RLS on
-- loan_requests let admins update and nobody else, and there was no status
-- for "the member changed their mind" — so the member-facing screen had a
-- Cancel button in the wireframes and nowhere to put the result.
--
-- Two halves, both of which open a write to members and so both of which are
-- fenced twice: an RLS policy saying which rows they may touch, and a trigger
-- saying which columns. RLS alone can only check the row it's given; it
-- cannot say "you may set this column and no other", and a WITH CHECK that
-- passes would happily let a member rewrite review_note or reviewed_by on the
-- way past.

-- ── Cancelling a checkout request ────────────────────────────────────────
-- A fourth status rather than a delete: a request that was made and called
-- off is a thing that happened, it shows in the member's Past list, and the
-- audit log has something to point at. 'denied' is the admin's no;
-- 'cancelled' is the member's.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loan_requests_status_check') then
    alter table loan_requests drop constraint loan_requests_status_check;
  end if;
end $$;

alter table loan_requests
  add constraint loan_requests_status_check
  check (status in ('pending', 'approved', 'denied', 'cancelled'));

-- Only from 'pending', and only their own. USING sees the row as it is, WITH
-- CHECK as it would become, so the pair is the whole transition: a member
-- cannot cancel a request already approved (that hardware is in their hands
-- — the way out of that is a return), nor cancel somebody else's, nor move a
-- cancelled request back to pending.
drop policy if exists "Members cancel their own pending requests" on loan_requests;
create policy "Members cancel their own pending requests"
  on loan_requests for update
  to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

-- ── Asking to return ─────────────────────────────────────────────────────
-- The member's half of a return. The admin's half is returned_at, set when
-- the hardware is physically handed back and checked in (see the
-- 20260922000000 migration) — these are two different moments and a loan can
-- sit between them for days, which is exactly the state the member's
-- "Processing return request" badge and the admin list's long-dormant
-- "Returns" bucket describe.
--
-- Nothing in the app sets this yet: the member-facing return flow is still to
-- be built. The column lands with the screen that reads it so that screen can
-- be written against a real shape rather than a guess.

alter table loan_request_items
  add column if not exists return_requested_at timestamptz,
  add column if not exists return_requested_by uuid references profiles(id);

-- The interesting query is "who is waiting on us to take something back",
-- and a row already checked in is not part of it.
create index if not exists loan_request_items_return_requested_idx
  on loan_request_items (loan_request_id)
  where return_requested_at is not null and returned_at is null;

-- Their own item, on an approved request, not already back. A member cannot
-- raise a return for hardware that was never handed to them, and cannot
-- re-raise one for hardware already checked in.
drop policy if exists "Members request a return on their own loans" on loan_request_items;
create policy "Members request a return on their own loans"
  on loan_request_items for update
  to authenticated
  using (
    returned_at is null
    and exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_items.loan_request_id
        and loan_requests.user_id = auth.uid()
        and loan_requests.status = 'approved'
    )
  )
  with check (
    returned_at is null
    and exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_items.loan_request_id
        and loan_requests.user_id = auth.uid()
        and loan_requests.status = 'approved'
    )
  );

-- ── Column fences ────────────────────────────────────────────────────────
-- What the RLS policies above cannot express. Admins are returned early and
-- keep the wide access they have always had; for everyone else the update is
-- compared column by column and rejected unless the only differences are the
-- ones that policy exists to allow.
--
-- jsonb minus drops the permitted keys from both sides, so what's left is
-- "everything they weren't supposed to touch" on each — and those two have to
-- be identical.

create or replace function public.guard_member_loan_request_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'A member may only cancel a checkout request, not edit it';
  end if;

  return new;
end;
$$;

drop trigger if exists on_loan_request_member_update_guard on loan_requests;
create trigger on_loan_request_member_update_guard
  before update on loan_requests
  for each row execute function public.guard_member_loan_request_update();

create or replace function public.guard_member_loan_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
    return new;
  end if;

  if (to_jsonb(new) - 'return_requested_at' - 'return_requested_by')
     is distinct from
     (to_jsonb(old) - 'return_requested_at' - 'return_requested_by') then
    raise exception 'A member may only request a return, not edit the loan';
  end if;

  return new;
end;
$$;

drop trigger if exists on_loan_item_member_update_guard on loan_request_items;
create trigger on_loan_item_member_update_guard
  before update on loan_request_items
  for each row execute function public.guard_member_loan_item_update();

-- ── Audit ────────────────────────────────────────────────────────────────
-- audit_loan_request_reviewed (20260921000000) already fires on any status
-- change and would log a cancellation as "moved to cancelled". This gives it
-- the sentence it deserves — and says who did it, because a member calling
-- off their own request and an admin turning it down are different events
-- that would otherwise read almost the same.

create or replace function public.audit_loan_request_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member text := public.audit_member_name(new.user_id);
  v_action text;
  v_summary text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'approved' then
    v_action := 'loan_request.approved';
    v_summary := v_member || '''s checkout request was approved and handed off';
  elsif new.status = 'denied' then
    v_action := 'loan_request.denied';
    v_summary := v_member || '''s checkout request was denied';
  elsif new.status = 'cancelled' then
    v_action := 'loan_request.cancelled';
    v_summary := v_member || ' cancelled their own checkout request';
  else
    v_action := 'loan_request.status_changed';
    v_summary := v_member || '''s checkout request moved to ' || new.status;
  end if;

  perform public.audit_write(
    'loans', v_action, 'loan_request', new.id, v_member, v_summary,
    public.audit_changes(to_jsonb(old), to_jsonb(new), array['status', 'review_note'])
  );
  return new;
end;
$$;

-- Same for the item side: a return request is an event, not a field edit
-- buried among others. Mirrors how 20260922000000 treats returned_at.

create or replace function public.audit_loan_item_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_changes jsonb;
  v_label text := public.audit_loan_item_label(new.equipment_id, new.equipment_unit_id);
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
