-- Admins cancelling a checkout request, with a reason the member is told.
--
-- 'cancelled' already exists as a status (20260925000000_member_loan_actions.sql)
-- but until now only the member could reach it, so "cancelled" meant "the
-- member changed their mind" and nothing else. An admin calling off a
-- request — the unit failed inspection, the member never turned up to
-- collect — is the same transition with a different author, and the member
-- deserves to know why. So this adds who and when and why to the request
-- rather than a fifth status: everything that already treats 'cancelled' as
-- closed (bucketForLoanItem, the unit-reservation guard, memberLoanState)
-- stays correct without being touched.
--
-- Safe to re-run.

alter table loan_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

-- Same on-delete behaviour as reviewed_by / returned_by
-- (20260927000000_profile_delete_fk_cleanup.sql): removing an admin's
-- account must not take the history of what they did with it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loan_requests_cancelled_by_fkey') then
    alter table loan_requests
      add constraint loan_requests_cancelled_by_fkey
      foreign key (cancelled_by) references public.profiles(id) on delete set null;
  end if;
end $$;

-- ── Who and when, stamped by the database ────────────────────────────────
-- Not trusted to the client, for the same reason audit_log isn't: a
-- cancellation from the SQL editor or a future second client should record
-- the same facts. Only the reason comes from the admin's update.
--
-- Trigger order matters here. Postgres fires same-timing triggers in name
-- order, and on_loan_request_member_update_guard has to see the member's
-- update as it was sent — status and nothing else — before this adds two
-- more columns to it. "stamp" sorts after "member", so it runs second.

create or replace function public.stamp_loan_request_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status and new.status = 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
    -- A blank reason is no reason. Stored as null so "was one given?" has
    -- one answer, not two.
    new.cancellation_reason := nullif(trim(new.cancellation_reason), '');
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_request_stamp_cancellation on loan_requests;
create trigger on_loan_request_stamp_cancellation
  before update on loan_requests
  for each row execute function public.stamp_loan_request_cancellation();

-- ── Audit ────────────────────────────────────────────────────────────────
-- Redefines audit_loan_request_reviewed from 20260925000000 so an admin's
-- cancellation doesn't read as "Alex cancelled their own checkout request",
-- and so the reason is recorded alongside the status change. Everything
-- else about the function is unchanged.

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
  elsif new.status = 'cancelled' and new.cancelled_by is not distinct from new.user_id then
    v_action := 'loan_request.cancelled';
    v_summary := v_member || ' cancelled their own checkout request';
  elsif new.status = 'cancelled' then
    v_action := 'loan_request.cancelled';
    v_summary := v_member || '''s checkout request was cancelled by an admin';
  else
    v_action := 'loan_request.status_changed';
    v_summary := v_member || '''s checkout request moved to ' || new.status;
  end if;

  perform public.audit_write(
    'loans', v_action, 'loan_request', new.id, v_member, v_summary,
    public.audit_changes(to_jsonb(old), to_jsonb(new), array['status', 'review_note', 'cancellation_reason'])
  );
  return new;
end;
$$;

-- ── Email ────────────────────────────────────────────────────────────────
-- Tells the member their request was called off and why. Only when someone
-- other than the member did it: a member who cancelled their own request
-- already knows, and an email saying so with a blank reason would read as
-- if someone else had.
--
-- Needs send-email redeployed with its `loan_request.cancelled` case, or the
-- event is ignored on arrival — harmless.

create or replace function public.notify_loan_request_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status
     and new.status = 'cancelled'
     and new.cancelled_by is distinct from new.user_id then
    perform public.notify_email_event('loan_request.cancelled', new.id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_request_cancelled_notify_email on loan_requests;
create trigger on_loan_request_cancelled_notify_email
  after update on loan_requests
  for each row execute function public.notify_loan_request_cancelled();

-- Sort order 2 is the slot checkout-request-approval held before
-- 20260918050000 removed it: straight after the confirmation, which is
-- where a member would expect to find what can happen to a request next.
-- Seeded with real copy so it's usable on day one; admins can rewrite it.
insert into email_templates (key, category, label, sort_order, dynamic_fields, subject, body) values
  ('checkout-request-cancellation', 'user', 'Checkout request cancellation', 2,
    array['user_name', 'hardware_name', 'hardware_serial', 'loan_start_date', 'cancellation_reason', 'admin_name', 'sent_date', 'sent_time'],
    'Your hardware checkout request was cancelled',
    '[
      {"type": "text", "value": "Hello "},
      {"type": "chip", "field": "user_name"},
      {"type": "text", "value": ",\n\nYour checkout request for "},
      {"type": "chip", "field": "hardware_name"},
      {"type": "text", "value": " was cancelled by a Hardware Manager.\n\nReason: "},
      {"type": "chip", "field": "cancellation_reason"},
      {"type": "text", "value": "\n\nIf you still need this hardware, you are welcome to submit a new request."}
    ]'::jsonb)
on conflict (key) do nothing;
