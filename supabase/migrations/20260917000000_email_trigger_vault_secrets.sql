-- notify_email_event (20260906000000) read its target URL and service role
-- key via current_setting('app.settings.*'), set with
-- `alter database postgres set ...`. Supabase no longer grants that
-- privilege to the SQL editor's role — `ALTER DATABASE ... SET` requires
-- database-owner privileges that the dashboard's connection doesn't have —
-- so those settings could never actually be configured, and the function's
-- "no-op until both are set" fallback was permanently engaged.
--
-- Supabase's supported replacement is Vault: secrets are stored encrypted
-- in the database via vault.create_secret() and read back through the
-- vault.decrypted_secrets view, which decrypts on the fly for whoever is
-- allowed to select from it. See:
-- https://supabase.com/docs/guides/database/vault
--
-- This migration only changes how the function reads its configuration.
-- The secrets themselves still need to be created once per environment —
-- see this file's closing comment and the updated README section.

create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_email_event(p_event text, p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('event', p_event, 'recordId', p_record_id)
  );
exception when others then
  raise warning 'notify_email_event failed for % %: %', p_event, p_record_id, sqlerrm;
end;
$$;

-- ── One-time setup, per environment ─────────────────────────────────────
-- Run once in the SQL editor, with your own project ref and service role
-- key (Project Settings -> API) substituted in. Safe to re-run: each call
-- either creates the named secret or updates it if it already exists.
--
--   select vault.create_secret(
--     'https://<project-ref>.functions.supabase.co',
--     'edge_functions_url'
--   );
--   select vault.create_secret(
--     '<service-role-key-from-project-settings>',
--     'service_role_key'
--   );
--
-- To rotate a secret later (e.g. after regenerating the service role key),
-- use vault.update_secret() with the existing secret's id instead of
-- create_secret() — create_secret() will otherwise raise a duplicate-name
-- error on the second call:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     '<new-service-role-key>'
--   );
--
-- No reconnect needed this time — unlike the old `alter database ... set`
-- approach, a secret written via vault.create_secret()/update_secret() is
-- visible to the next call immediately, since the function reads it fresh
-- from the table each time rather than from a session-level setting.
