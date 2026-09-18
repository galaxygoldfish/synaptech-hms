-- Every event send-email needs to resolve was failing with "permission
-- denied for table <name>" (42501), even after fixing the auth (Vault
-- secret, apikey header, matching key name — see the three migrations
-- immediately before this one) and even though this project's `service_role`
-- has BYPASSRLS. That's the same gap 20260817020000_equipment_grants.sql
-- hit and documented for `authenticated` on equipment/equipment_units/
-- equipment_addons: RLS policies (and BYPASSRLS) only decide which *rows*
-- a query can see, but Postgres still requires the calling role to hold the
-- underlying table privilege before RLS is even evaluated, and this
-- project's tables don't automatically inherit default privileges when
-- created. `service_role` never got that grant on any of the tables the
-- automated-email pipeline reads or writes:
--
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'service_role'
--     and table_name in ('profiles','loan_requests','loan_request_items',
--       'equipment','equipment_units','equipment_addons',
--       'email_templates','email_log');
--
-- returned only REFERENCES/TRIGGER/TRUNCATE for every one of them — no
-- SELECT, INSERT, UPDATE, or DELETE anywhere. This is why every dispatch
-- in supabase/functions/send-email/index.ts's resolveEvent, and every
-- write in supabase/functions/_shared/sendTemplatedEmail.ts, would have
-- failed the same way regardless of which auth mechanism reached it —
-- this predates and is unrelated to the secret-key migration; the legacy
-- service_role key would have hit the identical wall, since it
-- authenticates as the same `service_role` Postgres role.
--
-- send-scheduled-reminders (not yet scheduled) reads/writes the same
-- tables plus the reminder_*_sent_at columns on loan_request_items, so
-- it was equally blocked and is fixed by the same grants.

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.loan_requests to service_role;
grant select, insert, update, delete on public.loan_request_items to service_role;
grant select, insert, update, delete on public.equipment to service_role;
grant select, insert, update, delete on public.equipment_units to service_role;
grant select, insert, update, delete on public.equipment_addons to service_role;
grant select, insert, update, delete on public.email_templates to service_role;
grant select, insert, update, delete on public.email_log to service_role;
