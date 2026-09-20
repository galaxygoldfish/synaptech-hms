-- guard_member_loan_request_update / guard_member_loan_item_update
-- (20260925000000_member_loan_actions.sql) only ever let an update through
-- untouched when auth.uid() resolves to an admin — every other case is
-- compared column-by-column against what a member is allowed to change.
-- That's correct for a member's own request, but it also catches updates
-- that have no member behind them at all: a service-role client (no JWT,
-- so auth.uid() is null) has no way to satisfy the admin check, so an
-- ON DELETE SET NULL cascade from profile_delete_fk_cleanup — clearing
-- reviewed_by / returned_by / return_requested_by when the referenced
-- profile is deleted — gets rejected as if a member had edited the loan.
--
-- auth.uid() being null already means "not a signed-in user" everywhere
-- else in this schema (see audit_write's comment in 20260921000000_audit_log.sql)
-- — a service-role script, a cron job, or a change made directly in the
-- SQL editor, never a member. Treat it the same way here: trusted, like
-- an admin, not "someone with no permissions at all".

create or replace function public.guard_member_loan_request_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
    return new;
  end if;

  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'A member may only cancel a checkout request, not edit it';
  end if;

  return new;
end;
$$;

create or replace function public.guard_member_loan_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin') then
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
