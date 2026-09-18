-- An admin must be able to approve a request they did not make.
--
-- Approving (handOffLoanRequestItem in src/lib/loanRequests.ts) touches three
-- things the requesting member owns:
--
--   1. the member's signed agreement in the private `loan-agreements` bucket
--      (read it, then upload a stamped `-approved.pdf` copy beside it),
--   2. the member's loan_request_items row (point it at the stamped copy),
--   3. the member's loan_requests row (status -> approved).
--
-- The policies that let a *member* do these things are all scoped to their own
-- rows and their own storage folder (`{user_id}/…`). An admin who is also the
-- requester slips through them on the strength of owning the row, which is why
-- approving worked for a requester who had been promoted to admin — and why an
-- admin approving someone else's request depends entirely on the separate,
-- admin-only policies. Those were written with an inline
-- `exists (select … from profiles …)` check, the pattern that
-- 20260916000000_profiles_admin_visibility_fix.sql found to be fragile under
-- row-level security and replaced with public.is_admin() for `profiles`.
--
-- This restates every admin policy the approval relies on in terms of
-- is_admin(), for storage and both loan tables. It is additive and safe to
-- re-run: it drops and recreates only the policies it names, leaves every
-- member policy alone, and grants admins nothing beyond what those admin
-- policies already intended.

-- ── Storage: signed agreements ───────────────────────────────────────────
-- Any admin can read any member's agreement, and add or replace the stamped
-- copy next to it. `upsert: true` on the certificate upload needs all three.

drop policy if exists "Admins read loan agreements" on storage.objects;
create policy "Admins read loan agreements"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'loan-agreements' and public.is_admin());

drop policy if exists "Admins upload approved loan agreements" on storage.objects;
create policy "Admins upload approved loan agreements"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'loan-agreements' and public.is_admin());

drop policy if exists "Admins update approved loan agreements" on storage.objects;
create policy "Admins update approved loan agreements"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'loan-agreements' and public.is_admin())
  with check (bucket_id = 'loan-agreements' and public.is_admin());

-- ── loan_requests ────────────────────────────────────────────────────────

drop policy if exists "Admins view all loan requests" on loan_requests;
create policy "Admins view all loan requests"
  on loan_requests for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins review loan requests" on loan_requests;
create policy "Admins review loan requests"
  on loan_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── loan_request_items ───────────────────────────────────────────────────

drop policy if exists "Admins view all loan request items" on loan_request_items;
create policy "Admins view all loan request items"
  on loan_request_items for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins update loan request items" on loan_request_items;
create policy "Admins update loan request items"
  on loan_request_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Table privileges sit underneath policies: a policy only filters rows within a
-- privilege that has already been granted. Present since the original
-- migration; restated so this file stands on its own.
grant select, insert, update on public.loan_requests to authenticated;
grant select, insert, update on public.loan_request_items to authenticated;
