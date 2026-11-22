# Loan extensions — design

Date: 2026-11-22 · Branch: `feature/loan-extensions` · Status: draft for approval

## Intent

Return dates are capped at the end of the current quarter (Dec 15, Mar 20, Jun 10,
Aug 20 — `getQuarterEndDate` in `CheckoutReturnDate.tsx`). Members working on a
project group want to keep hardware **over the break into the next quarter**
instead of returning it in December and checking it out again in January.

An extension lets a member, in the last two weeks of a quarter, pick a new return
date in the next quarter and sign a fresh loan agreement for it. An admin approves
it with one click — no barcode scan, because the hardware hasn't moved.

Extensions are meant only for loans for project groups, but for now the app **does
not check this**: it shows a fixed notice, and admins use their own judgement. (A
separate, later feature — on its own branch — will ask "Is this loan for a project
group?" at checkout and store it; it may be wired into extensions afterwards.)

## Goals

- Member can request an extension on a handed-off hardware item from "My hardware
  loans", choosing a new date and signing a new agreement.
- Admin sees the request, approves or denies it (deny requires a reason).
- Approval moves `return_date`, points the item at the new stamped agreement and
  resets reminder emails so the new date gets reminders.
- Emails: admins on request; member on approval and on denial.
- Everything shows in the App audit log.

## Non-goals

- Any check of group status (notice only).
- The checkout "group loan?" question — separate branch, later.
- Extending pending (not yet handed-off) requests, consumables, or returned items.
- A queryable history of past extensions beyond the audit log and the agreement
  PDFs kept in storage.

## Anti-goals

- A new parallel pipeline. This must reuse the return-request pattern, the existing
  agreement PDF builder/preview, the section 10 stamp, `send-email`, the audit
  triggers and the reminder job — not duplicate them.
- An extension request appearing in the admin **Check out hardware** pick list
  (`CheckoutPickLoan` reads the `'requests'` bucket only).
- Overwriting any earlier agreement object in storage.

## Rules

- **Window.** Opens 14 days before the current quarter's end date and closes at the
  end of that date (inclusive): `quarterEnd - 14 days <= today <= quarterEnd`.
  Outside it (including the gaps where `getQuarterEndDate` returns `null`) the
  Extend action is disabled with a line saying when the next window opens.
- **Date range.** New date from `max(current return_date, today) + 1 day` up to the
  **next** quarter's end date (Dec 15 → Mar 20 → Jun 10 → Aug 20 → Dec 15).
- **Eligible item:** hardware, request `approved`, `returned_at` null,
  `return_requested_at` null, no extension already pending, and the current
  `return_date` is on or before this quarter's end (so one extension per window; a
  loan extended into winter can be extended again in winter's window). Overdue
  loans are eligible.
- **Repeat extensions** across windows are allowed.
- **Notice** (member before submitting, admin on the request): "Extensions are only
  for loans for project groups." Static text.
- A member can **withdraw** a pending extension (mirrors `cancelReturnRequest`).
- A pending extension does not block a return. If the item is returned, the pending
  extension is simply **ignored** (`returned_at` wins everywhere; nothing is written
  to the extension columns, so no trigger fires). Approval stays allowed after the
  window closes (the window limits *requesting*, not reviewing).
- A pending extension is **not** an approved one: an overdue loan with a pending
  extension stays overdue — red home card, checkout still blocked — until an admin
  approves it.

## Approaches considered

- **A. Extension columns on `loan_request_items` (chosen).** Mirrors the
  return-request flow: a few columns, a member RLS policy plus the existing
  column-whitelist guard trigger, audit via the existing item-update audit trigger,
  emails via `notify_email_event`. Trade-off: one pending extension per item at a
  time; history lives in `audit_log` and storage. Same trade-off returns already make.
- **B. `loan_extensions` table.** Full queryable history, but its own RLS, grants,
  audit and email triggers — about double the database work for history the audit
  log already keeps.
- **C. Extension as a new `loan_request`.** Ruled out: it would route through
  hand-off (scan) and the unit-reservation guard would refuse the still-held unit.

## Design

### Database — one migration, `20261122000000_loan_extensions.sql`

Idempotent, modelled on `20260925000000_member_loan_actions.sql` and
`20261002000000_admin_loan_cancellation.sql`.

Columns on `loan_request_items`:

| Column | Meaning |
| --- | --- |
| `extension_status text` | `null` (never asked) \| `'pending'` \| `'approved'` \| `'denied'` \| `'withdrawn'`; check constraint. Triggers key off transitions of this column |
| `extension_requested_at timestamptz`, `extension_requested_by uuid → profiles` | when/who asked |
| `extension_return_date date` | requested new date |
| `extension_previous_return_date date` | the `return_date` at request time, so the approval email and audit entry can show old → new after `return_date` has moved |
| `extension_agreement_path text` | the newly signed PDF |
| `extension_signature_name text`, `extension_signature_date date` | section 9 values on that PDF |
| `extension_review_note text` | deny reason |
| `extension_reviewed_at timestamptz`, `extension_reviewed_by uuid → profiles` | admin decision |

**Nothing is cleared** on approve, deny or withdraw — the row keeps the most recent
extension's details until the next request overwrites them, so `send-email` (which
re-reads the row by id via `pg_net`, later) always finds what it needs. "Pending" is
`extension_status = 'pending' and returned_at is null`.

On **approve** (one conditional update, `where extension_status = 'pending'`):
`return_date ← extension_return_date`, `signed_agreement_path ←` stamped copy,
`signature_name/signature_date ←` the extension's values (so section 9 read-back
matches the agreement now on file; the original stays in storage and the audit log),
`extension_status ← 'approved'`, reviewed_at/by, reminder columns ← null.

- **Member write:** extend the existing member update policy/guard so a member can
  write the request columns (`extension_status` to `'pending'` or, from pending,
  `'withdrawn'`; requested_at/by, return_date, previous_return_date, agreement_path,
  signature name/date) on their own item, only while it's approved and not returned
  — never the review columns, `return_date` or `signed_agreement_path`. The guard trigger's
  column whitelist (`guard_member_loan_item_update`) gains these columns. Date
  bounds are enforced client-side; the admin reviewing the request is the real
  gate (documented in the migration).
- **Admin write:** existing admin update access (`20260926020000`) already covers
  the row. Approve and deny are compare-and-set on `extension_status = 'pending'`
  (throw `LoanConflictError` otherwise).
- **Reminders:** approval sets `reminder_one_week_sent_at`,
  `reminder_due_date_sent_at`, `reminder_past_due_sent_at` to null.
- **Audit:** extend `audit_loan_item_updated` with readable entries keyed off
  `extension_status` changes: `loan_item.extension_requested`, `…_withdrawn`,
  `…_approved` (old → new date), `…_denied` (same style as
  `loan_item.return_requested`). Add the new columns to the audit log's labels.
- **Emails:** `notify_email_event` fires `loan_item.extension_requested`,
  `loan_item.extension_approved`, `loan_item.extension_denied` on the matching
  `extension_status` transitions. Seed three `email_templates` rows: admin-facing
  `hardware-extension-requested`; member-facing `loan-extension-approved` (old and
  new dates) and `loan-extension-denied` (reason). Redeploy `send-email` after.

### Storage

New agreement object alongside the others:
`${user_id}/${loan_request_id}/${equipment_id}-extension-<request epoch ms>.pdf` —
the request timestamp, so a withdraw-and-resubmit or a re-request after a denial
never collides with an earlier object; approval stamps it to `…-approved.pdf` via
`stampApprovedAgreement`. Member
upload falls under the existing own-folder policy.

### Shared logic — `src/lib/quarters.ts` (new, pure, unit-tested)

Move `getQuarterEndDate` out of `CheckoutReturnDate.tsx` and add
`nextQuarterEndDate(quarterEnd)` and `extensionWindow(today)`
→ `{ opensOn, closesOn, maxDate } | null`. `CheckoutReturnDate` imports from here
(no behaviour change).

### Data access

- `src/lib/memberLoans.ts`: `requestExtension({ itemId, newDate, agreementPath,
  signatureName, signatureDate, memberId })`, `withdrawExtension(itemId)`; select
  the new columns; `canExtend(loan, today)` helper. Invalidate `memberLoans`.
- `src/lib/loanRequests.ts`: `approveExtension(itemId, adminName)` (fetch signed URL
  → `stampApprovedAgreement` with the signed-in admin's name and now → conditional
  update; throws `LoanConflictError` if no longer pending) and
  `denyExtension(itemId, reason)`. Invalidate the loans area.
- **A flag, not a bucket.** `bucketForLoanItem` is unchanged, so a loan with a
  pending extension stays `'active'`/`'overdue'` for the return pick list, the
  serial-match helpers, `CheckoutPickLoan`, dashboard counts and the member's
  `memberLoanState`/`homeLoanTone`. A new `hasPendingExtension(loan)` helper
  (`extensionStatus === 'pending' && !returnedAt`) drives the extra UI; the admin
  "Requests" filter also includes rows where it's true. The item summaries gain
  `extensionStatus`/`extensionReturnDate`.

### Member UI

- `MyLoanDetail`: an **Extend loan** button beside Request return when eligible
  (disabled with "Extensions open Dec 1" outside the window); an **Extension
  requested — until <date>** badge with **Withdraw** while pending.
- New route `/home/loans/:id/extend` (+ `ROUTE_TITLES` entry), one screen:
  notice → date field (reuse `DateSelectButton` from the checkout date step,
  extracted if needed) → `AgreementPreview` in sign mode with the new date →
  Submit. Builds the PDF with `buildLoanAgreementPdf` from the same fields the
  checkout signing step uses (serial from the item's unit), uploads, then calls
  `requestExtension` (upload first, so the request never points at a missing file).

### Admin UI

- `HardwareLoans`: rows with a pending extension show "Extension requested to
  <date>" and appear under the Requests filter as well as their own state.
- `LoanDetail`: an **Extension requested** row showing current → requested date,
  the notice, a link to the new signed agreement, and **Approve extension** /
  **Deny** (deny opens a `ModalDialog` with a required reason, 500 chars, like admin
  cancel).

### Tests

`quarters.ts` window/next-quarter unit tests; `hasPendingExtension` (incl.
returned-wins) and an unchanged-bucket regression test;
`canExtend`; component tests for the extend screen (redirect when ineligible,
submit order), MyLoanDetail button states, LoanDetail approve/deny (incl. conflict
error); `router.test.tsx` title check.

### Docs

Add an "Loan extensions" subsection to AGENTS.md → Hardware loans, and a short
user-facing guide note if the docs folder covers My hardware loans.

## Calls made without asking (check these)

- Approval stamp: section 10 of the new agreement is filled with the approval
  date/time and the **signed-in** admin's name (hand-off uses a typed name because
  hardware physically changes hands; here it doesn't).
- Members can withdraw a pending extension.
- Denial reason is required (500 chars), shown to the member only by email.
- Pending extension doesn't relieve an overdue loan's red card / checkout block.
- A pending extension is ignored, not cleared, when the item is returned.
- Approval copies the extension's signature over `signature_name/date`.
- Requested-date bounds are enforced in the app only; the admin is the gate.

## Left to the builder

Exact copy, layout and CSS; whether the date field is extracted or duplicated;
email wording; audit label text; test file split.
