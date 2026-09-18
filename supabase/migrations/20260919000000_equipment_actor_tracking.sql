-- The "modified by" chip in hardware-item-added/hardware-item-modified has
-- always rendered blank: `admin_name` is in both templates' dynamic_fields,
-- but nothing has ever populated it, because the equipment.created/
-- equipment.updated triggers only ever passed the equipment row's own id —
-- there's no column on `equipment` recording who created or last edited it,
-- and no way for send-email to know that otherwise.
--
-- notify_email_event gains an optional third argument for exactly this —
-- who performed the action, when there is a "who" beyond the row itself.
-- It's optional (defaults to null) so every other trigger's existing
-- 2-argument call still resolves correctly, with no changes needed there.
--
-- `create or replace function` with a different parameter LIST creates a
-- second, distinct overload rather than replacing the original — Postgres
-- treats functions with different arity as different functions entirely.
-- The old 2-argument version must be dropped explicitly, or every other
-- trigger's 2-argument call keeps resolving to it (an exact-arity match
-- always wins over a default-parameter match) — leaving two copies of
-- this function's body to keep in sync by hand from here on, silently.

drop function if exists public.notify_email_event(text, uuid);

create or replace function public.notify_email_event(p_event text, p_record_id uuid, p_actor_id uuid default null)
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
    body := jsonb_build_object('event', p_event, 'recordId', p_record_id, 'actorId', p_actor_id)
  );
exception when others then
  raise warning 'notify_email_event failed for % %: %', p_event, p_record_id, sqlerrm;
end;
$$;

-- auth.uid() reflects the original request's JWT claims regardless of this
-- function's own SECURITY DEFINER context, and equipment is always edited
-- through the browser's authenticated client (src/lib/inventory.ts), never
-- a service-role bypass — so this is reliably the acting admin, with no
-- schema change needed on `equipment` itself.

create or replace function public.notify_equipment_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_email_event('equipment.created', new.id, auth.uid());
  return new;
end;
$$;

create or replace function public.notify_equipment_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_email_event('equipment.updated', new.id, auth.uid());
  return new;
end;
$$;

-- loan_request.approved's own admin_name chip (hardware-handed-off) has the
-- same symptom but a simpler fix: loan_requests.reviewed_by already records
-- exactly this, set by checkoutLoanRequestItem in loanRequests.ts — it was
-- just never read by send-email's resolveEvent. No DB change needed there,
-- only the Edge Function code.
