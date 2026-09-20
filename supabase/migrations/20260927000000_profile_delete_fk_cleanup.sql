-- Deleting a profiles row currently fails for any admin who has ever
-- reviewed/returned a loan or edited an email template: reviewed_by,
-- returned_by, return_requested_by and updated_by all reference
-- profiles(id) with the Postgres default ON DELETE NO ACTION, so Postgres
-- raises a foreign-key violation rather than letting the row go. This
-- brings those four in line with audit_log.actor_id and
-- inventory_audits.performed_by, which already use ON DELETE SET NULL —
-- the loan/template row survives, only the "who did this" reference clears.
--
-- These columns were added inline via `references ...` (see
-- 20260817030000_loan_requests.sql, 20260922000000_loan_item_return.sql,
-- 20260925000000_member_loan_actions.sql, 20260906000000_email_templates.sql),
-- so their constraint names are whatever Postgres auto-generated rather than
-- something this migration can name directly. Each block below looks up the
-- actual name via pg_constraint before dropping and recreating it, so this
-- is safe to re-run and doesn't depend on guessing the default naming.
--
-- Deliberately not touching 20260914061000_loan_approval_audit.sql's
-- `approved_by` column: it's added to `public.loans`, a table that doesn't
-- exist anywhere in this migrations directory, so that migration appears to
-- have never applied successfully. Unrelated to this cleanup.

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.loan_requests'::regclass
    and confrelid = 'public.profiles'::regclass
    and pg_get_constraintdef(oid) like '%(reviewed_by)%';
  if fk_name is not null then
    execute format('alter table public.loan_requests drop constraint %I', fk_name);
  end if;
  alter table public.loan_requests
    add constraint loan_requests_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null;
end $$;

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.loan_request_items'::regclass
    and confrelid = 'public.profiles'::regclass
    and pg_get_constraintdef(oid) like '%(returned_by)%';
  if fk_name is not null then
    execute format('alter table public.loan_request_items drop constraint %I', fk_name);
  end if;
  alter table public.loan_request_items
    add constraint loan_request_items_returned_by_fkey
    foreign key (returned_by) references public.profiles(id) on delete set null;
end $$;

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.loan_request_items'::regclass
    and confrelid = 'public.profiles'::regclass
    and pg_get_constraintdef(oid) like '%(return_requested_by)%';
  if fk_name is not null then
    execute format('alter table public.loan_request_items drop constraint %I', fk_name);
  end if;
  alter table public.loan_request_items
    add constraint loan_request_items_return_requested_by_fkey
    foreign key (return_requested_by) references public.profiles(id) on delete set null;
end $$;

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.email_templates'::regclass
    and confrelid = 'public.profiles'::regclass
    and pg_get_constraintdef(oid) like '%(updated_by)%';
  if fk_name is not null then
    execute format('alter table public.email_templates drop constraint %I', fk_name);
  end if;
  alter table public.email_templates
    add constraint email_templates_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete set null;
end $$;
