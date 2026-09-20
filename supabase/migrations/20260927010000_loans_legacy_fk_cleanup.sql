-- `public.loans` (member_id, approved_by -> profiles(id), both ON DELETE
-- NO ACTION) is not created anywhere in supabase/migrations/ and is not
-- read or written by any app code (grep for `.from('loans')` across src/
-- turns up nothing — every current loan lookup goes through loan_requests
-- / loan_request_items). It appears to predate that table and was never
-- dropped. Since it still exists in the live database and still holds a
-- blocking FK to profiles, deleting an account referenced there (e.g. an
-- admin who "approved" something back when this table was in use) fails
-- with a foreign-key violation — this is what was breaking self-delete
-- while deleting an ordinary member worked fine.
--
-- Not dropping the table itself here — it may still hold historical rows
-- worth keeping even though nothing reads them anymore, and that's a
-- separate decision from unblocking profile deletion. Just bringing its
-- profiles FKs in line with the same on-delete behavior used everywhere
-- else in this cleanup (see 20260927000000_profile_delete_fk_cleanup.sql).

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.loans'::regclass
    and confrelid = 'public.profiles'::regclass
    and pg_get_constraintdef(oid) like '%(member_id)%';
  if fk_name is not null then
    execute format('alter table public.loans drop constraint %I', fk_name);
  end if;
  alter table public.loans
    add constraint loans_member_id_fkey
    foreign key (member_id) references public.profiles(id) on delete cascade;
end $$;

do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'public.loans'::regclass
    and confrelid = 'public.profiles'::regclass
    and pg_get_constraintdef(oid) like '%(approved_by)%';
  if fk_name is not null then
    execute format('alter table public.loans drop constraint %I', fk_name);
  end if;
  alter table public.loans
    add constraint loans_approved_by_fkey
    foreign key (approved_by) references public.profiles(id) on delete set null;
end $$;
