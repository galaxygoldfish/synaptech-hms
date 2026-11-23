-- Loan extensions: a member keeping hardware over the break into the next
-- quarter.
--
-- In the last two weeks of a quarter a member can pick a new return date (up
-- to the next quarter's end) and sign a fresh loan agreement for it. An admin
-- approves with one click — no scan, the hardware hasn't moved — or denies it
-- with a reason. The window and the date bounds are the app's
-- (src/lib/quarters.ts); the database's job is the same as for a return
-- request: fence what a member may write, stamp who and when, and on approval
-- make the change itself so no client has to get it right.
--
-- Modelled on the return request (20260925000000_member_loan_actions.sql):
-- columns on loan_request_items rather than a table of their own. One
-- extension per item at a time; earlier ones live in audit_log and as the
-- agreement objects kept in the loan-agreements bucket. Nothing below is
-- cleared on approve, deny or withdraw, so send-email — which re-reads the
-- row by id, later, via pg_net — always finds what it needs.
--
-- "Extensions are only for loans for project groups" is a notice in the app,
-- deliberately not enforced here.
--
-- Run after 20261005000000. Redeploy send-email afterwards, or its three
-- events are ignored on arrival (harmless). Safe to re-run.

alter table loan_request_items
  add column if not exists extension_status text,
  add column if not exists extension_requested_at timestamptz,
  add column if not exists extension_requested_by uuid,
  add column if not exists extension_return_date date,
  -- return_date as it stood when the member asked: once approval moves
  -- return_date, this is the only record of what it was.
  add column if not exists extension_previous_return_date date,
  add column if not exists extension_agreement_path text,
  add column if not exists extension_signature_name text,
  add column if not exists extension_signature_date date,
  add column if not exists extension_review_note text,
  add column if not exists extension_reviewed_at timestamptz,
  add column if not exists extension_reviewed_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loan_request_items_extension_status_check') then
    alter table loan_request_items
      add constraint loan_request_items_extension_status_check
      check (extension_status in ('pending', 'approved', 'denied', 'withdrawn'));
  end if;
  -- Same on-delete behaviour as returned_by / cancelled_by
  -- (20260927000000_profile_delete_fk_cleanup.sql).
  if not exists (select 1 from pg_constraint where conname = 'loan_request_items_extension_requested_by_fkey') then
    alter table loan_request_items
      add constraint loan_request_items_extension_requested_by_fkey
      foreign key (extension_requested_by) references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loan_request_items_extension_reviewed_by_fkey') then
    alter table loan_request_items
      add constraint loan_request_items_extension_reviewed_by_fkey
      foreign key (extension_reviewed_by) references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists loan_request_items_extension_pending_idx
  on loan_request_items (loan_request_id)
  where extension_status = 'pending' and returned_at is null;

-- ── Column fences ────────────────────────────────────────────────────────
-- Rows: the existing "Members request a return on their own loans" policy
-- already limits a member's updates to their own item, on an approved
-- request, not yet back — exactly the items that can be extended — so no new
-- policy. Columns: redefines the guard from 20260927020000 to also allow the
-- request half of an extension, and nothing a member could use to approve
-- their own: not return_date, not signed_agreement_path, not the review
-- columns. The status itself is fenced to the two moves a member makes.

--
-- Three more rules, all about the extension:
--   * The terms (date, agreement, signature) can only be written in the same
--     update that asks — never edited while an admin is looking at them, or
--     the admin could approve a date they never saw.
--   * Who asked, when, and the date being replaced are not member-writable
--     at all; stamp_loan_item_extension sets them.
--   * Asking again within EXTENSION_COOLDOWN of the last ask is refused, so
--     withdraw-and-resubmit can't be used to flood admins with emails.
--   The new date must also be after both today and the current due date, and
--   within 140 days — a loose ceiling on the app's next-quarter cap (the
--   longest real span, Aug 6 → Dec 15, is 131 days). The exact cap stays in
--   the app; the admin reviewing the date is the final check.

create or replace function public.guard_member_loan_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_return_columns text[] := array['return_requested_at', 'return_requested_by'];
  v_terms text[] := array[
    'extension_status', 'extension_return_date', 'extension_agreement_path',
    'extension_signature_name', 'extension_signature_date'
  ];
  v_asking boolean;
begin
  if auth.uid() is null or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
    return new;
  end if;

  v_asking := new.extension_status = 'pending' and old.extension_status is distinct from 'pending';

  if v_asking then
    if (to_jsonb(new) - v_return_columns - v_terms) is distinct from (to_jsonb(old) - v_return_columns - v_terms) then
      raise exception 'A member may only request a return or an extension, not edit the loan';
    end if;
    if old.extension_requested_at is not null and old.extension_requested_at > now() - interval '15 minutes' then
      raise exception 'Please wait a few minutes before asking for another extension';
    end if;
    if new.extension_return_date is null
       or new.extension_return_date <= greatest(old.return_date, current_date)
       or new.extension_return_date > current_date + 140 then
      raise exception 'That return date cannot be used for an extension';
    end if;
    if new.extension_agreement_path is null or new.extension_signature_name is null or new.extension_signature_date is null then
      raise exception 'An extension needs a newly signed agreement';
    end if;
    return new;
  end if;

  if old.extension_status = 'pending' and new.extension_status = 'withdrawn' then
    if (to_jsonb(new) - 'extension_status') is distinct from (to_jsonb(old) - 'extension_status') then
      raise exception 'Withdrawing an extension changes nothing else';
    end if;
    return new;
  end if;

  if old.extension_status is distinct from new.extension_status then
    raise exception 'A member may only request or withdraw an extension';
  end if;

  if (to_jsonb(new) - v_return_columns) is distinct from (to_jsonb(old) - v_return_columns) then
    raise exception 'A member may only request a return or an extension, not edit the loan';
  end if;

  return new;
end;
$$;

-- ── Who, when, and what approval changes ─────────────────────────────────
-- Stamped by the database, as stamp_loan_request_cancellation does, so an
-- extension decided from the SQL editor records the same facts. Approval
-- also moves the loan here rather than in the client: the new date, the
-- signature that goes with the new agreement, and the reminder flags — a
-- reminder already sent for the old date must not stop one for the new.
-- The client sends only the status (and, approving, the stamped agreement's
-- path).
--
-- "stamp" sorts after "member", so on_loan_item_member_update_guard sees the
-- member's update as sent, before this adds columns to it.

create or replace function public.stamp_loan_item_extension()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.extension_status is not distinct from new.extension_status then
    return new;
  end if;

  if new.extension_status = 'pending' then
    new.extension_requested_at := now();
    new.extension_requested_by := auth.uid();
    new.extension_previous_return_date := old.return_date;
    new.extension_review_note := null;
    new.extension_reviewed_at := null;
    new.extension_reviewed_by := null;
  elsif new.extension_status = 'approved' then
    new.return_date := new.extension_return_date;
    new.signature_name := new.extension_signature_name;
    new.signature_date := new.extension_signature_date;
    new.reminder_one_week_sent_at := null;
    new.reminder_due_date_sent_at := null;
    new.reminder_past_due_sent_at := null;
    new.extension_reviewed_at := now();
    new.extension_reviewed_by := auth.uid();
  elsif new.extension_status = 'denied' then
    new.extension_review_note := nullif(trim(new.extension_review_note), '');
    new.extension_reviewed_at := now();
    new.extension_reviewed_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists on_loan_item_stamp_extension on loan_request_items;
create trigger on_loan_item_stamp_extension
  before update on loan_request_items
  for each row execute function public.stamp_loan_item_extension();

-- ── Audit ────────────────────────────────────────────────────────────────
-- Redefines audit_loan_item_updated from 20261005000000 with one more event
-- block; everything else is unchanged. An extension is an event, not a field
-- edit buried among others — and approval moves return_date and
-- signed_agreement_path in the same update, which this reports as one
-- "extended from … to …" rather than a generic "updated".

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

  if old.extension_status is distinct from new.extension_status then
    if new.extension_status = 'pending' then
      perform public.audit_write(
        'loans', 'loan_item.extension_requested', 'loan_request_item', new.id, v_label,
        v_label || ' — the borrower asked to extend it to ' || to_char(new.extension_return_date, 'Mon FMDD, YYYY')
      );
    elsif new.extension_status = 'approved' then
      perform public.audit_write(
        'loans', 'loan_item.extension_approved', 'loan_request_item', new.id, v_label,
        v_label || ' was extended from '
          || coalesce(to_char(new.extension_previous_return_date, 'Mon FMDD, YYYY'), 'no date')
          || ' to ' || to_char(new.return_date, 'Mon FMDD, YYYY'),
        jsonb_build_array(jsonb_build_object(
          'field', 'return_date', 'from', new.extension_previous_return_date, 'to', new.return_date
        ))
      );
    elsif new.extension_status = 'denied' then
      perform public.audit_write(
        'loans', 'loan_item.extension_denied', 'loan_request_item', new.id, v_label,
        v_label || ' — extension denied'
      );
    elsif new.extension_status = 'withdrawn' then
      perform public.audit_write(
        'loans', 'loan_item.extension_withdrawn', 'loan_request_item', new.id, v_label,
        v_label || ' — the borrower withdrew their extension request'
      );
    end if;
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

-- ── Email ────────────────────────────────────────────────────────────────
-- Admins hear about a request; the member hears the decision. A withdrawal
-- sends nothing — the member made it, and admins can see it in the audit log.

create or replace function public.notify_loan_item_extension()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.extension_status is not distinct from new.extension_status then
    return new;
  end if;

  if new.extension_status = 'pending' then
    perform public.notify_email_event('loan_item.extension_requested', new.id, auth.uid());
  elsif new.extension_status = 'approved' then
    perform public.notify_email_event('loan_item.extension_approved', new.id, auth.uid());
  elsif new.extension_status = 'denied' then
    perform public.notify_email_event('loan_item.extension_denied', new.id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists on_loan_item_extension_notify_email on loan_request_items;
create trigger on_loan_item_extension_notify_email
  after update on loan_request_items
  for each row execute function public.notify_loan_item_extension();

-- The trigger functions are for triggers only, like the other audit/notify
-- helpers: nothing holding a user's JWT should call them directly.
revoke all on function public.stamp_loan_item_extension() from public, anon, authenticated;
revoke all on function public.notify_loan_item_extension() from public, anon, authenticated;

-- Seeded with real copy so they're usable on day one; admins can rewrite them.
insert into email_templates (key, category, label, sort_order, dynamic_fields, subject, body) values
  ('hardware-extension-requested', 'admin', 'Hardware extension requested', 8,
    array['user_name', 'hardware_name', 'hardware_serial', 'previous_return_date', 'return_date', 'sent_date', 'sent_time'],
    'Loan extension requested',
    '[
      {"type": "chip", "field": "user_name"},
      {"type": "text", "value": " asked to extend their loan of "},
      {"type": "chip", "field": "hardware_name"},
      {"type": "text", "value": " ("},
      {"type": "chip", "field": "hardware_serial"},
      {"type": "text", "value": ") from "},
      {"type": "chip", "field": "previous_return_date"},
      {"type": "text", "value": " to "},
      {"type": "chip", "field": "return_date"},
      {"type": "text", "value": ".\n\nExtensions are only for loans for project groups. Review it from the loan details screen in Synaptech HMS."}
    ]'::jsonb),
  ('loan-extension-approved', 'user', 'Loan extension approved', 8,
    array['user_name', 'hardware_name', 'hardware_serial', 'previous_return_date', 'return_date', 'admin_name', 'sent_date', 'sent_time'],
    'Your hardware loan was extended',
    '[
      {"type": "text", "value": "Hello "},
      {"type": "chip", "field": "user_name"},
      {"type": "text", "value": ",\n\nYour extension for "},
      {"type": "chip", "field": "hardware_name"},
      {"type": "text", "value": " was approved. It is now due back on "},
      {"type": "chip", "field": "return_date"},
      {"type": "text", "value": " instead of "},
      {"type": "chip", "field": "previous_return_date"},
      {"type": "text", "value": "."}
    ]'::jsonb),
  ('loan-extension-denied', 'user', 'Loan extension denied', 9,
    array['user_name', 'hardware_name', 'hardware_serial', 'return_date', 'denial_reason', 'admin_name', 'sent_date', 'sent_time'],
    'Your hardware loan extension was not approved',
    '[
      {"type": "text", "value": "Hello "},
      {"type": "chip", "field": "user_name"},
      {"type": "text", "value": ",\n\nYour extension for "},
      {"type": "chip", "field": "hardware_name"},
      {"type": "text", "value": " was not approved.\n\nReason: "},
      {"type": "chip", "field": "denial_reason"},
      {"type": "text", "value": "\n\nIt is still due back on "},
      {"type": "chip", "field": "return_date"},
      {"type": "text", "value": "."}
    ]'::jsonb)
on conflict (key) do nothing;
