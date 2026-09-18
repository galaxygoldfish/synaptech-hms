-- Completing a return. Until now the app could record a checkout but never
-- the other end of it: `loan_requests.status` goes pending -> approved and
-- stops there, and bucketForLoanItem (src/lib/loanRequests.ts) treated every
-- approved item as permanently still out. That's why the "Returns" bucket
-- and the hardware-returned / successful-return-confirmation email
-- templates have existed but never fired — there was no flow for them.
--
-- The return is recorded per ITEM, not per request, because a request can
-- bundle several items with their own return dates (see
-- loan_request_items.return_date) and they come back separately. A request's
-- status stays 'approved' throughout; "is it back?" is answered by
-- returned_at, not by the parent's status.
--
-- Depends on 20260921000000_audit_log.sql (it redefines an audit trigger
-- function created there). Run that one first.

alter table loan_request_items
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid references profiles(id);

-- Partial: the interesting query is "which items are still out", and every
-- row that has come back is uninteresting to it.
create index if not exists loan_request_items_outstanding_idx
  on loan_request_items (loan_request_id)
  where returned_at is null;

-- ── Return notification ──────────────────────────────────────────────────
-- Fires the two templates that have been dormant since
-- 20260906000000_email_templates.sql: successful-return-confirmation to the
-- member and hardware-returned to the admins. Both need send-email to be
-- redeployed with the `loan_item.returned` case it gains alongside this
-- migration, or the event is simply ignored on arrival — harmless.

create or replace function public.notify_loan_item_returned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only the null -> set transition. An admin correcting some other field on
  -- an already-returned item must not re-send the confirmation.
  if old.returned_at is null and new.returned_at is not null then
    perform public.notify_email_event('loan_item.returned', new.id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_item_returned_notify_email on loan_request_items;
create trigger on_loan_item_returned_notify_email
  after update on loan_request_items
  for each row execute function public.notify_loan_item_returned();

-- ── Audit ────────────────────────────────────────────────────────────────
-- Redefines the generic loan-item update auditor from
-- 20260921000000_audit_log.sql so that a return reads as the event it is
-- ("Muse 2 (SYN-ABC123) was returned") rather than as a field edit buried
-- among others. Everything else about that function is unchanged.

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
