-- Availability for the other end of a loan.
--
-- loan_request_availability (20260817030000) records when a member is free to
-- collect hardware. Giving it back needs the same thing at the other end, and
-- for the same reason: a Hardware Manager has to find an hour that suits both
-- of them. Rather than a second near-identical table, the existing one gains
-- a `kind`.
--
-- The two kinds hang off different things, which is the whole reason this
-- isn't just a boolean. A checkout is arranged once for the whole submission —
-- everything in it is collected together. A return is per ITEM: returned_at
-- has been per item since 20260922000000 because a request can bundle several
-- things with their own return dates and they come back separately. So a
-- return row points at the item, and a checkout row points at the request.

alter table loan_request_availability
  add column if not exists kind text not null default 'checkout',
  add column if not exists loan_request_item_id uuid references loan_request_items(id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loan_request_availability_kind_check') then
    alter table loan_request_availability
      add constraint loan_request_availability_kind_check
      check (kind in ('checkout', 'return'));
  end if;

  -- Which column is filled is decided by the kind, not left to the caller: a
  -- return row with no item would be unattributable once a request bundles
  -- more than one, and a checkout row pointing at a single item would claim
  -- the member is only free to collect part of their own order.
  if not exists (select 1 from pg_constraint where conname = 'loan_request_availability_target_check') then
    alter table loan_request_availability
      add constraint loan_request_availability_target_check
      check (
        (kind = 'checkout' and loan_request_item_id is null)
        or (kind = 'return' and loan_request_item_id is not null)
      );
  end if;
end $$;

-- The original constraint was one slot per request per hour, which a return
-- would now collide with — a member may well be free at 2pm both to collect
-- one thing and to give another back. Two partial indexes say the same thing
-- per kind instead.
alter table loan_request_availability
  drop constraint if exists loan_request_availability_unique;

create unique index if not exists loan_request_availability_checkout_unique
  on loan_request_availability (loan_request_id, available_date, available_hour)
  where kind = 'checkout';

create unique index if not exists loan_request_availability_return_unique
  on loan_request_availability (loan_request_item_id, available_date, available_hour)
  where kind = 'return';

create index if not exists loan_request_availability_return_item_idx
  on loan_request_availability (loan_request_item_id)
  where kind = 'return';

-- ── Editing what you submitted ───────────────────────────────────────────
-- Members could insert availability and never touch it again, because at the
-- time there was no screen that let them. "Edit checkout availability" and
-- "Edit return availability" are that screen, and a grid is saved by
-- replacing the set rather than diffing it — so the member needs delete on
-- their own rows as well as the insert they already had.
--
-- Only their own, and only while the request is still theirs to change: once
-- an admin has approved a checkout, when they are free to collect it is
-- history. A return stays editable until the hardware is actually checked in.

grant delete on public.loan_request_availability to authenticated;

drop policy if exists "Members edit their own availability" on loan_request_availability;
create policy "Members edit their own availability"
  on loan_request_availability for delete
  to authenticated
  using (
    exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_availability.loan_request_id
        and loan_requests.user_id = auth.uid()
        and (
          (loan_request_availability.kind = 'checkout' and loan_requests.status = 'pending')
          or (loan_request_availability.kind = 'return' and loan_requests.status = 'approved')
        )
    )
    and (
      loan_request_availability.kind = 'checkout'
      or exists (
        select 1 from loan_request_items
        where loan_request_items.id = loan_request_availability.loan_request_item_id
          and loan_request_items.returned_at is null
      )
    )
  );

-- The insert policy from 20260817030000 only checked that the request is the
-- member's, which was enough when the only insert was the submission itself.
-- Now that they can add slots later, it has to check the same windows the
-- delete policy does, or an approved checkout could quietly grow new hours.
drop policy if exists "Members create their own loan request availability" on loan_request_availability;
create policy "Members create their own loan request availability"
  on loan_request_availability for insert
  to authenticated
  with check (
    exists (
      select 1 from loan_requests
      where loan_requests.id = loan_request_availability.loan_request_id
        and loan_requests.user_id = auth.uid()
        and (
          (loan_request_availability.kind = 'checkout' and loan_requests.status = 'pending')
          or (loan_request_availability.kind = 'return' and loan_requests.status = 'approved')
        )
    )
    and (
      loan_request_availability.kind = 'checkout'
      or exists (
        select 1 from loan_request_items
        where loan_request_items.id = loan_request_availability.loan_request_item_id
          and loan_request_items.returned_at is null
      )
    )
  );

-- ── Cancelling a return request ──────────────────────────────────────────
-- guard_member_loan_item_update (20260925000000) lets a member set
-- return_requested_at on their own approved, un-returned item. Clearing it
-- again — changing their mind before anyone has collected anything — is the
-- same column and so is already allowed; this note exists only so the next
-- reader doesn't go looking for a policy that would let them.
