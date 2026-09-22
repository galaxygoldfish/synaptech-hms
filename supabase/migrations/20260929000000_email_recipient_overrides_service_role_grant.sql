-- email_template_recipient_overrides (20260928000000) only granted
-- authenticated, missing the same service_role grant every other
-- email-pipeline table already needed (see
-- 20260918010000_email_pipeline_service_role_grants.sql for why: RLS/
-- BYPASSRLS decides which rows a query can see, but Postgres still checks
-- table-level privilege first, and this project's tables don't inherit
-- default grants). fetchAdminCcOverrides (supabase/functions/_shared/db.ts)
-- reads this table on every event send-email resolves, so every dispatch
-- was throwing "permission denied for table
-- email_template_recipient_overrides" before ever reaching
-- sendTemplatedEmail — which is also why none of these failures showed up
-- in the "Automated email log" screen's Failed filter: that screen only
-- reads email_log, and sendTemplatedEmail's insert (both the 'sent' and
-- 'failed' cases) never ran. Read-only grant — service_role only ever
-- selects from this table, never writes to it.

grant select on public.email_template_recipient_overrides to service_role;
