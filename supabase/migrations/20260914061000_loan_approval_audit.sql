-- Structured audit fields for the admin's signed-agreement approval.
alter table public.loans
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz;
