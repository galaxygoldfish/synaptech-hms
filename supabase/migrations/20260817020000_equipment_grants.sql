-- Table-level GRANTs for equipment/equipment_units/equipment_addons.
--
-- RLS policies only decide which *rows* a query can see/touch — Postgres
-- still requires the `authenticated` role to hold the underlying table
-- privilege before RLS is even evaluated. New tables don't automatically
-- inherit a project's default privileges, and `equipment_addons` never
-- got this grant, so every query against it failed with
-- "permission denied for table equipment_addons" (42501) even though its
-- own SELECT policy allowed the read. Re-granting all three defensively
-- in case the same gap exists elsewhere.

grant select, insert, update, delete on public.equipment to authenticated;
grant select, insert, update, delete on public.equipment_units to authenticated;
grant select, insert, update, delete on public.equipment_addons to authenticated;
