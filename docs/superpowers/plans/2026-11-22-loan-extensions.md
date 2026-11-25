# Loan Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can request to extend a handed-off hardware loan over the break into the next quarter by picking a new date and signing a new agreement; an admin approves (no scan) or denies with a reason.

**Architecture:** Extension columns on `loan_request_items`, mirroring the return-request pattern: member writes through the existing RLS policy plus the column-fence guard trigger; a stamp trigger records who/when and, on approval, moves the date, copies the signature and resets reminders; audit and email reuse `audit_write` / `notify_email_event` / `send-email`. Client side reuses `buildLoanAgreementPdf`, `AgreementPreview`, `stampApprovedAgreement`, `fetchSignedAgreementUrl`, `ModalDialog`. A pending extension is a flag, not a new loan bucket.

**Tech Stack:** React 19 + TS, Vite, Supabase (Postgres/PostgREST/Storage, Deno Edge Functions), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-11-22-loan-extensions-design.md`

## Global Constraints

- Work on branch `feature/loan-extensions` only. Feature 2 (checkout "group loan?" question) is out of scope.
- Quarter ends: Dec 15, Mar 20, Jun 10, Aug 20. Next-quarter chain: Dec 15 → Mar 20 (next year) → Jun 10 → Aug 20 → Dec 15.
- Window: opens 14 days before the quarter end, closes at the end of the quarter-end day (both inclusive). No window when `getQuarterEndDate` returns `null`.
- Notice copy, verbatim, shown to member and admin: **"Extensions are only for loans for project groups."**
- Deny reason required, max 500 characters (client-side), same as admin cancel.
- Never overwrite an agreement object. Extension PDF path: `${userId}/${loanRequestId}/${equipmentId}-extension-${Date.now()}.pdf`.
- `bucketForLoanItem` must not change behaviour.
- Migrations idempotent, unique version prefix, applied by hand (never `supabase db push`).
- Every new route needs a `ROUTE_TITLES` entry.
- Writes invalidate their cache area (`CACHE_KEYS.memberLoans` / `CACHE_KEYS.adminLoans`).
- No AI attribution lines in commits.
- `npm run test:run` and `npm run build` pass before push.

## Review Focus

1. Window edges: Dec 1 and Dec 15 are open, Nov 30 and Dec 16 are not; Jun 12 and Aug 25 (gaps) have no window. → tests in Task 1.
2. Year rollover: a Dec 15 quarter's max date is Mar 20 of the **next** year. → Task 1.
3. Already extended in this window (current `return_date` after this quarter's end) or return requested → no Extend button. → Task 3 `canExtend` tests.
4. Two admins / double click approving → second gets `LoanConflictError`, nothing re-stamped. → Task 4.
5. Item returned while extension pending → no extension UI anywhere, loan shows returned. → Task 4 `hasPendingExtension`, Task 6 LoanDetail test.

---

### Task 1: Quarter + extension-window helpers

**Files:**
- Create: `src/lib/quarters.ts`
- Modify: `src/components/user-dashboard/CheckoutReturnDate.tsx` (delete local `getQuarterEndDate`/`toISODate`, import from `quarters.ts`; no behaviour change)
- Test: `src/test/quarters.test.ts`

**Interfaces:**
- Produces:
  - `toISODate(date: Date): string` (local `YYYY-MM-DD`, moved as-is)
  - `getQuarterEndDate(today: Date): string | null` (moved as-is)
  - `nextQuarterEndDate(quarterEnd: string): string`
  - `interface ExtensionWindow { opensOn: string; closesOn: string; maxDate: string; isOpen: boolean }`
  - `extensionWindow(today: Date): ExtensionWindow | null` — `closesOn` = this quarter's end, `opensOn` = closesOn − 14 days, `maxDate` = `nextQuarterEndDate(closesOn)`, `isOpen` = opensOn ≤ today ≤ closesOn; `null` in gaps.

- [ ] **Step 1: Write failing tests** in `src/test/quarters.test.ts` (construct dates with `new Date(y, m, d)`):
  - `nextQuarterEndDate('2026-12-15') === '2027-03-20'`, `'2027-03-20' → '2027-06-10'`, `'2027-06-10' → '2027-08-20'`, `'2027-08-20' → '2027-12-15'`.
  - `extensionWindow(Dec 1 2026)` → `{ opensOn: '2026-12-01', closesOn: '2026-12-15', maxDate: '2027-03-20', isOpen: true }`.
  - `extensionWindow(Dec 15 2026).isOpen === true`; `extensionWindow(Nov 30 2026).isOpen === false` (opensOn still `'2026-12-01'`).
  - `extensionWindow(Mar 6 2027).isOpen === true`, `extensionWindow(Mar 5 2027).isOpen === false`.
  - `extensionWindow(Jun 12 2027) === null`; `extensionWindow(Aug 25 2027) === null`.
  - `extensionWindow(Aug 20 2027).maxDate === '2027-12-15'`.
- [ ] **Step 2:** `npx vitest run src/test/quarters.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/lib/quarters.ts`; switch `CheckoutReturnDate.tsx` to import `toISODate`, `getQuarterEndDate`.
- [ ] **Step 4:** `npx vitest run src/test/quarters.test.ts src/test/CheckoutReturnDate*` → PASS (run whichever checkout return-date tests exist; `npm run test:run` if unsure).
- [ ] **Step 5:** Commit `Quarters: shared quarter-end and extension-window helpers`.

---

### Task 2: Migration `supabase/migrations/20261122000000_loan_extensions.sql`

No SQL test harness exists; verification is a careful read plus applying it in the Supabase SQL editor (manual, by the user — note it in the final report). Model style/comments on `20261002000000_admin_loan_cancellation.sql`.

**Contents (each item decided; write idiomatically):**

1. **Columns** on `loan_request_items` (`add column if not exists`):
   `extension_status text` with check `extension_status in ('pending','approved','denied','withdrawn')` (null allowed; add constraint via `pg_constraint` guard like the cancellation FK);
   `extension_requested_at timestamptz`, `extension_requested_by uuid`, `extension_return_date date`, `extension_previous_return_date date`, `extension_agreement_path text`, `extension_signature_name text`, `extension_signature_date date`, `extension_review_note text`, `extension_reviewed_at timestamptz`, `extension_reviewed_by uuid`.
   FKs `extension_requested_by`/`extension_reviewed_by` → `profiles(id) on delete set null`.
   Partial index on `(loan_request_id) where extension_status = 'pending' and returned_at is null`.

2. **Guard** — redefine `public.guard_member_loan_item_update()` from `20260927020000` (keep its `auth.uid() is null or is admin → return new` head). Member may change only: `return_requested_at`, `return_requested_by`, `extension_status`, `extension_requested_at`, `extension_requested_by`, `extension_return_date`, `extension_previous_return_date`, `extension_agreement_path`, `extension_signature_name`, `extension_signature_date` (strip these keys from both jsonb sides, as today). Additionally, if `extension_status` changed, allow only `new = 'pending'` (from anything except `'pending'`) or `old = 'pending' and new = 'withdrawn'`; otherwise raise `'A member may only request or withdraw an extension'`. The existing RLS policy "Members request a return on their own loans" already limits rows to own + approved + not returned — reuse it, don't add a policy.

3. **Stamp trigger** `public.stamp_loan_item_extension()` `before update`, trigger name `on_loan_item_stamp_extension` (sorts after `on_loan_item_member_update_guard`, so the guard sees the member's raw update). When `extension_status` changes to:
   - `'pending'`: `extension_requested_at := now()`, `extension_requested_by := auth.uid()`, `extension_previous_return_date := old.return_date`, clear `extension_review_note`, `extension_reviewed_at`, `extension_reviewed_by`.
   - `'approved'`: `return_date := new.extension_return_date`, `signature_name := new.extension_signature_name`, `signature_date := new.extension_signature_date`, the three `reminder_*_sent_at := null`, `extension_reviewed_at := now()`, `extension_reviewed_by := auth.uid()`.
   - `'denied'`: `extension_reviewed_at/by` as above; `extension_review_note := nullif(trim(new.extension_review_note), '')`.

4. **Audit** — redefine `public.audit_loan_item_updated()` copying the latest body from `20261005000000_loan_item_unit_switch.sql` verbatim, inserting, after the `return_requested_at` block, one block: if `old.extension_status is distinct from new.extension_status`, write `loan_item.extension_<status>` (`requested` for `'pending'`, else `approved`/`denied`/`withdrawn`) with summaries: requested "`<label>` — the borrower asked to extend it to `<date>`", approved "`<label>` was extended from `<old>` to `<new>`" (changes array `[{field:'return_date', from: extension_previous_return_date, to: return_date}]`), denied "`<label>` — extension denied", withdrawn "`<label>` — the borrower withdrew their extension request"; then `return new`.

5. **Email** — `public.notify_loan_item_extension()` `after update`, trigger `on_loan_item_extension_notify_email`: on `extension_status` change to `'pending'` → `notify_email_event('loan_item.extension_requested', new.id, auth.uid())`; `'approved'` → `'loan_item.extension_approved'`; `'denied'` → `'loan_item.extension_denied'`. Withdrawn sends nothing.

6. **Templates** — `insert … on conflict (key) do nothing`, body format as in the cancellation migration:
   - `hardware-extension-requested` (category `admin`, label "Hardware extension requested"), fields `user_name, hardware_name, hardware_serial, previous_return_date, return_date, sent_date, sent_time`.
   - `loan-extension-approved` (`user`, "Loan extension approved"), fields `user_name, hardware_name, hardware_serial, previous_return_date, return_date, admin_name, sent_date, sent_time`.
   - `loan-extension-denied` (`user`, "Loan extension denied"), fields `user_name, hardware_name, hardware_serial, return_date, denial_reason, admin_name, sent_date, sent_time`. Here `return_date` = the unchanged current date.
   `sort_order`: after the existing rows in each category.

- [ ] **Step 1:** Write the migration as above.
- [ ] **Step 2:** Self-check against the list: guard rejects a member setting `extension_status='approved'`, `return_date`, `signed_agreement_path` or `extension_review_note`; all `create trigger` preceded by `drop trigger if exists`; file re-runnable.
- [ ] **Step 3:** Commit `Loan extensions: schema, guard, stamp, audit and email triggers`.

---

### Task 3: Member data access

**Files:**
- Modify: `src/lib/memberLoans.ts`
- Test: `src/test/memberLoans.test.ts` (pure helper), `src/test/fetchMemberLoans.test.ts` (mocked supabase, follow its existing mock style)

**Interfaces:**
- Consumes: `extensionWindow`, `ExtensionWindow` (Task 1).
- Produces:
  - `type ExtensionStatus = 'pending' | 'approved' | 'denied' | 'withdrawn'`
  - `MemberLoanItem` gains `extensionStatus: ExtensionStatus | null`, `extensionReturnDate: string | null` (add both to `ItemRow`, `ITEM_COLUMNS`, `zipItems`, and `fetchMemberLoanItem`'s select).
  - `canExtend(item: MemberLoanItem, now?: Date): boolean` — true iff `!isConsumable`, `requestStatus === 'approved'`, `!returnedAt`, `!returnRequestedAt`, `extensionStatus !== 'pending'`, `extensionWindow(now)?.isOpen`, and `returnDate` ≤ that window's `closesOn`.
  - `interface RequestExtensionInput { item: MemberLoanItem; userId: string; newReturnDate: string; agreementFile: File; signatureName: string; signatureDate: string }`
  - `requestExtension(input): Promise<void>` — upload `agreementFile` to `loan-agreements` at the Global Constraints path (`contentType: 'application/pdf'`), **then** update the item `{ extension_status: 'pending', extension_return_date, extension_agreement_path, extension_signature_name, extension_signature_date }` `.eq('id').is('returned_at', null)`; invalidate `CACHE_KEYS.memberLoans` (finally); throw on error.
  - `withdrawExtension(itemId: string): Promise<void>` — update `{ extension_status: 'withdrawn' }` `.eq('id').eq('extension_status','pending')`; invalidate.

- [ ] **Step 1: Failing tests:**
  - `canExtend`: true for approved hardware due `2026-12-15` at `now = Dec 5 2026`; false at Nov 25; false when `returnDate = '2027-03-01'` (already extended); false with `returnRequestedAt` set; false when `extensionStatus = 'pending'`; true when `'denied'`; false for consumables; false when returned; **true when overdue** (`returnDate = '2026-12-02'`, now Dec 5).
  - `requestExtension`: upload called before update (record call order), upload path matches `/^u1\/r1\/e1-extension-\d+\.pdf$/`, update payload as above; upload error → no update call, rejects.
  - `withdrawExtension`: update payload `{ extension_status: 'withdrawn' }` filtered on pending.
- [ ] **Step 2:** Run those test files → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `Loan extensions: member request and withdraw`.

---

### Task 4: Admin data access

**Files:**
- Modify: `src/lib/loanRequests.ts`
- Test: `src/test/loanRequests.test.ts`, `src/test/loanConflicts.test.ts`

**Interfaces:**
- Consumes: `ExtensionStatus` (Task 3; import type from `memberLoans.ts`).
- Produces:
  - `AdminLoanRequestItemSummary` gains `extensionStatus: ExtensionStatus | null`, `extensionReturnDate: string | null` (add to the select at ~line 852 and the mapping).
  - `AdminLoanRequestDetail` (from `fetchLoanRequestItemDetail`) gains `extensionStatus`, `extensionReturnDate`, `extensionPreviousReturnDate`, `extensionRequestedAt`, `extensionAgreementPath`, `extensionReviewNote` (all `string | null`).
  - `hasPendingExtension(loan: Pick<AdminLoanRequestItemSummary, 'extensionStatus' | 'returnedAt'>): boolean` — `extensionStatus === 'pending' && !returnedAt`.
  - `approveExtension(input: { itemId: string; adminName: string }): Promise<void>` — read `extension_status, extension_agreement_path, returned_at`; if not pending or returned → `LoanConflictError('This extension was already reviewed, or the hardware has been returned.')`; `stampApprovedAgreement({ agreementUrl: await fetchSignedAgreementUrl(path), agreementPath: path, managerName: adminName, receivedAt: new Date() })`; compare-and-set update `{ extension_status: 'approved', signed_agreement_path: stampedPath }` `.eq('id').eq('extension_status','pending').is('returned_at', null).select('id')`; empty result → same `LoanConflictError`. Invalidate `CACHE_KEYS.adminLoans` in `finally`.
  - `denyExtension(itemId: string, reason: string): Promise<void>` — compare-and-set `{ extension_status: 'denied', extension_review_note: reason }` on pending; empty → `LoanConflictError`; invalidate.

- [ ] **Step 1: Failing tests:**
  - `hasPendingExtension`: pending+not returned → true; pending+returned → false; `'approved'`/`null` → false.
  - Regression: `bucketForLoanItem` for an approved, in-date loan with a pending extension is still `'active'`; overdue one still `'overdue'`.
  - `approveExtension`: stamps the extension path (not `signed_agreement_path`) and updates with `{ extension_status: 'approved', signed_agreement_path: '<path>-approved.pdf' }`; when the CAS update returns `[]` it rejects with `LoanConflictError`; when the read says `'approved'` it rejects without calling the stamp.
  - `denyExtension`: payload `{ extension_status: 'denied', extension_review_note: 'No group' }`; `[]` → `LoanConflictError`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `Loan extensions: admin approve and deny`.

---

### Task 5: Member UI — extend screen and loan detail

**Files:**
- Create: `src/components/user-dashboard/ExtendLoan.tsx` (+ `ExtendLoan.module.css`), `src/pages/ExtendLoanPage.tsx` (thin, like `ReturnAvailabilityPage.tsx`)
- Modify: `src/router.tsx` (route `/home/loans/:id/extend` under `PrivateRoute`; `ROUTE_TITLES` entry `['/home/loans/:id/extend', 'Extend a loan']`), `src/components/user-dashboard/MyLoanDetail.tsx`, and if needed `CheckoutReturnDate.tsx` (export `DateSelectButton` instead of duplicating it)
- Test: `src/test/ExtendLoan.test.tsx`, `src/test/MyLoanDetail.test.tsx`, `src/test/router.test.tsx` (already enforces titles)

**Interfaces:**
- Consumes: `fetchMemberLoanItem`, `canExtend`, `requestExtension`, `withdrawExtension` (Task 3); `extensionWindow` (Task 1); `buildLoanAgreementPdf`, `preloadAgreementPdfLib`; `AgreementPreview` in the same sign mode/props `CheckoutSignAgreement` uses; `fetchEquipmentByIds` for `replacement_value`; `useAuth().profile`.

**Behaviour:**
- `ExtendLoan`: loads the item; if `!canExtend(item)` → `navigate('/home/loans/' + id, { replace: true })`. Shows the notice, current due date, a date field (`min` = day after `max(returnDate, today)`, `max` = window `maxDate`), then `AgreementPreview` with the new return date and the borrower's signature name/date inputs (as checkout). **Submit** enabled when date + name + date are filled; builds the PDF with the same field mapping as `CheckoutSignAgreement.handleNext` (`loanDate` = `formatDate(item.reviewedAt ?? item.requestedAt)`, `serialNumber` = `item.serialNumber`, `returnDate` = new date), wraps it in a `File`, calls `requestExtension`, then navigates to `/home/loans/:id`. Error → inline "Could not submit your extension. Please try again."
- `MyLoanDetail`: next to Request return, an **Extend loan** button → `/home/loans/:id/extend`, shown when the item is out with the member and not return-requested. Enabled iff `canExtend(item)`; when disabled because the window isn't open, show "Extensions open <opensOn formatted>" (or "Extensions aren't available right now" when `extensionWindow` is `null`). While `extensionStatus === 'pending'`: badge "Extension requested — until <extensionReturnDate>" and a **Withdraw** button calling `withdrawExtension` then reload.

- [ ] **Step 1: Failing tests:**
  - `ExtendLoan`: redirects to `/home/loans/i1` when `canExtend` is false (mock it); renders the notice text verbatim; Submit disabled until date+signature filled; on submit `requestExtension` called with `newReturnDate` = picked date and a `File`, then lands on `/home/loans/i1`.
  - `MyLoanDetail`: Extend button enabled when `canExtend` true; disabled with "Extensions open" text when false and window not open; pending state shows badge and Withdraw calls `withdrawExtension('i1')`.
  - `router.test.tsx` passes with the new title.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run those + `npm run test:run` → PASS.
- [ ] **Step 5:** Commit `Loan extensions: member extend screen`.

---

### Task 6: Admin UI — loans list and loan detail

**Files:**
- Modify: `src/components/admin-dashboard/HardwareLoans.tsx`, `src/components/admin-dashboard/LoanDetail.tsx`
- Test: `src/test/HardwareLoans.test.tsx`, `src/test/LoanDetail.test.tsx`, `src/test/CheckoutPickLoan.test.tsx` (regression)

**Interfaces:**
- Consumes: `hasPendingExtension`, `approveExtension`, `denyExtension`, `fetchSignedAgreementUrl`, detail fields (Task 4); `ModalDialog`; `useAuth().profile` for the admin's name (`first_name last_name`).

**Behaviour:**
- `HardwareLoans`: the Requests filter also includes rows where `hasPendingExtension(loan)`; such rows' subtitle reads "Extension requested to <date>".
- `LoanDetail`: when `hasPendingExtension(detail)`, an **Extension requested** row: "<previous/current due> → <requested>", the notice, **View extension agreement** (opens signed URL of `extensionAgreementPath`), **Approve extension** (calls `approveExtension({ itemId, adminName })`, then reloads), **Deny** (opens `ModalDialog` with a required reason textarea, `maxLength={500}`, confirm calls `denyExtension`). `LoanConflictError` message shown inline like the existing cancel/switch errors. Hidden once returned.

- [ ] **Step 1: Failing tests:**
  - `HardwareLoans`: an active loan with `extensionStatus: 'pending'` appears under Requests with "Extension requested to"; with `'approved'` it doesn't.
  - `LoanDetail`: pending → notice + Approve calls `approveExtension({ itemId: 'i1', adminName: 'Ada Admin' })`; Deny confirm disabled until a reason is typed, then calls `denyExtension('i1', 'No group')`; conflict error message rendered; returned item with pending extension → no extension row.
  - `CheckoutPickLoan`: an approved loan with a pending extension is not listed.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `Loan extensions: admin review`.

---

### Task 7: Emails, audit labels, docs, full verification

**Files:**
- Modify: `supabase/functions/send-email/index.ts`, `src/lib/emailTemplates.ts`, `src/components/admin-dashboard/AuditLog.tsx`, `AGENTS.md`

**Behaviour:**
- `send-email`: three cases keyed on item id, modelled on `loan_item.returned` / `loan_request.cancelled`. Each reads the item (`equipment_id, equipment_unit_id, loan_request_id, return_date, extension_return_date, extension_previous_return_date, extension_review_note, extension_reviewed_by`), its request's `user_id`, profile, equipment name, serial. Fields: `user_name`, `hardware_name`, `hardware_serial`, `previous_return_date` = `formatDate(extension_previous_return_date)`, `return_date` = `formatDate(return_date)` (for requested: `formatDate(extension_return_date)`), `denial_reason`, `admin_name` = `fetchActorName(admin, extension_reviewed_by)`.
  - `loan_item.extension_requested` → `dispatchToAdmins(admin, 'hardware-extension-requested', fields)`.
  - `loan_item.extension_approved` → member `loan-extension-approved` with `extraCc: await resolveExtraCc(...)`.
  - `loan_item.extension_denied` → member `loan-extension-denied`.
- `emailTemplates.ts`: `EMAIL_FIELD_LABELS` add `previous_return_date: 'PREVIOUS RETURN DATE'`, `denial_reason: 'REASON'`; blurbs/timing/recipient for the three keys (admin recipient `{ name: 'Synaptech', email: EMAIL_ARCHIVE_CC_ADDRESS }`, matching `hardware-checkout-requested`).
- `AuditLog.tsx`: `ACTION_LABEL` add `loan_item.extension_requested: 'Extension requested'`, `…_approved: 'Extension approved'`, `…_denied: 'Extension denied'`, `…_withdrawn: 'Extension withdrawn'`.
- `AGENTS.md` → Hardware loans: a "Loan extensions" subsection (window, rules, flag-not-bucket, migration + "redeploy `send-email`" note, the notice is not enforced).

- [ ] **Step 1:** If `src/test` has tests asserting `EMAIL_FIELD_LABELS`/template descriptions cover every key, extend them for the new keys; otherwise none.
- [ ] **Step 2:** Implement the four files.
- [ ] **Step 3:** `npm run test:run` → all pass; `npm run build` → succeeds; `npm run lint` → no new errors.
- [ ] **Step 4:** Commit `Loan extensions: emails, audit labels, docs`, push branch.
- [ ] **Step 5:** Report deploy steps for the user: apply `20261122000000_loan_extensions.sql` in the SQL editor, then `supabase functions deploy send-email --no-verify-jwt`, then deploy the web app.
