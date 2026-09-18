-- The service_role key stored under 20260917000000's vault secret named
-- 'service_role_key' was, at the moment it was entered, exposed outside
-- the database (see that incident's notes — this migration doesn't repeat
-- the details). Rather than depend on that key at all, the pipeline now
-- authenticates with a Supabase secret key (Settings > API Keys), which is
-- a separate, independently revocable credential.
--
-- Secret keys aren't JWTs, so they go on the `apikey` header rather than
-- `Authorization: Bearer` — see:
-- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys#database-webhooks-and-pg_net
--
-- The vault secret name is unchanged (still 'service_role_key') to avoid
-- also having to edit its lookup — only what's stored under that name, and
-- the header it's sent on, changed. Renaming it is left for a later pass;
-- functionally it now holds a secret key, not a service_role JWT.

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
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key),
    body := jsonb_build_object('event', p_event, 'recordId', p_record_id)
  );
exception when others then
  raise warning 'notify_email_event failed for % %: %', p_event, p_record_id, sqlerrm;
end;
$$;

-- ── One-time setup, per environment ─────────────────────────────────────
-- 1. Create a secret key: Dashboard -> Project Settings -> API Keys ->
--    "Publishable and secret API keys" tab -> Create new key (or use the
--    project's existing `default` secret key). Copy the sb_secret_... value.
--
-- 2. Store it in Vault under the SAME name as before, replacing whatever
--    is there now:
--
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'service_role_key'),
--        '<sb_secret_...>'
--      );
--
--    If that select returns no row (nothing named 'service_role_key' yet),
--    use create_secret() instead — note the ARGUMENT ORDER: the secret
--    value goes first, the name second.
--
--      select vault.create_secret('<sb_secret_...>', 'service_role_key');
--
-- 3. Redeploy send-email with JWT verification off, since a secret key
--    isn't a JWT for the platform's own gate to check:
--
--      supabase functions deploy send-email --no-verify-jwt
