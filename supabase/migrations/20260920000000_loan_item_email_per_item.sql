-- notify_loan_item_requested previously only fired for the row where
-- item_role = 'primary', so a checkout with add-ons sent exactly one
-- confirmation email (and one admin notification) for the whole request,
-- with the add-on's own signed agreement never mentioned or attached
-- anywhere. Every hardware/consumable item a member checks out should get
-- its own confirmation — and, for hardware, its own signed agreement PDF
-- attached (see send-email/index.ts's "loan_item.requested" case) — so
-- this now fires for every loan_request_items row, not just the primary.
create or replace function public.notify_loan_item_requested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_email_event('loan_item.requested', new.id);
  return new;
end;
$$;
