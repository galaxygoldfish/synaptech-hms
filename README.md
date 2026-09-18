# Synaptech HMS

Synaptech HMS is a hardware management system for Synaptech that helps the club track and organize its equipment. The platform supports both an admin experience and a member experience so inventory can be managed efficiently while members can check out hardware when needed.

## Features

- Admin-side dashboard for managing hardware inventory and club operations
- Member-side dashboard for viewing current hardware loans and requesting checkouts
- Google OAuth sign-in restricted to `@uw.edu` accounts, with role-based routing
- Centralized views for inventory status and actions
- An app-wide audit log of every change, recorded server-side by Postgres triggers

## Tech Stack

- React 19, TypeScript, Vite
- Supabase (Postgres + Auth) for data and authentication
- React Router v7 for client-side routing and auth guards
- Vitest + React Testing Library for tests
- Oxlint for linting
- Styling: custom CSS / CSS Modules

## Project Structure

- `src/pages/` — top-level routed pages (welcome, profile setup, admin home, member home)
- `src/components/` — shared and page-specific components (`admin-dashboard/`, `user-dashboard/`)
- `src/context/` — `AuthContext`, the single source of auth/session/profile state
- `src/router.tsx` — route guards (`PublicRoute`, `SetupRoute`, `PrivateRoute`, `AdminRoute`)
- `src/lib/` — Supabase client and auth helpers
- `src/types/` and `src/types.ts` — Supabase row types vs. dashboard/API-shaped types (see note below)
- `src/test/` — Vitest test suite

## Getting Started

### Prerequisites

- Node.js
- npm
- A Supabase project with the `profiles`, `loans`, `equipment`, `equipment_units`, and `equipment_addons` tables, plus a public `equipment-images` storage bucket (see [Database](#database) below)

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create `.env.local` (gitignored):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Run the app

```bash
npm run dev
```

## Development

```bash
npm run dev        # Vite dev server with HMR
npm run build      # Type-check then build for production
npm run test       # Vitest in watch mode
npm run test:run   # Vitest single run (CI)
npm run lint       # Oxlint
npm run preview    # Preview a production build locally
```

## Database

Auth and profile data live in `profiles`, keyed by `auth.uid()`, with `role` (`'member'` | `'admin'`) enforced server-side (a trigger forces new rows to `'member'`; only a service-role change can promote a user to admin). Hardware tracking lives in three related tables:

- `equipment` — a catalog entry: `name`, `description`, `image_url`, `product_type` (`'hardware'` | `'consumable'`), `category` (`'recording'` | `'modulation'` | `'tools'` | `'peripherals'` | `'computing'` | `'virtual_reality'`, required for hardware, `null` for consumables since "consumable" is already their category), `replacement_value`, `quantity_total`, `documentation_url`
- `equipment_units` — a physical, serialized unit of a `'hardware'` `equipment` entry (`equipment_id`, unique `serial_number`); consumables aren't individually serialized, so `quantity_total` on `equipment` is their stock count
- `equipment_addons` — links an `equipment` row to another *existing* `equipment` row that acts as its optional or required add-on at checkout (`equipment_id`, `addon_equipment_id`, `addon_type`). No new equipment is created by a link — the admin "add a new item" flow's Optional/Required add-on toggles open a searchable picker over the existing catalog to create these links.

Checkout submissions live in three more tables:

- `loan_requests` — one row per checkout submission: `user_id`, `status` (`'pending'` | `'approved'` | `'denied'`, defaults to `'pending'` until an admin reviews it), `requested_at`, and `reviewed_at`/`reviewed_by`/`review_note` once reviewed
- `loan_request_items` — one row per `equipment` item bundled into a request (the primary item plus any optional/required add-ons — `item_role`), each with its own `equipment_unit_id` (the serial offered at submission), `return_date` (hardware only), and `signed_agreement_path`
- `loan_request_availability` — one row per hour the member marked free in the 14-day pickup availability grid (`available_date`, `available_hour`)

These model the request phase the checkout flow captures (submit → admin approves/denies) plus the hand-back at the end of it: `loan_request_items.returned_at`/`returned_by` record that a physical item came back, per item rather than per request, since a request can bundle several items with their own return dates. A request's status stays `'approved'` throughout — "is it back?" is answered by `returned_at`, not by the parent's status — and `bucketForLoanItem` in [`src/lib/loanRequests.ts`](src/lib/loanRequests.ts) is the single place that turns those fields into the Active / Overdue / Requests / Returns / Returned states the list, the detail screen and the dashboard stat cards all read. The return columns and their triggers are in [`supabase/migrations/20260922000000_loan_item_return.sql`](supabase/migrations/20260922000000_loan_item_return.sql).

Product photos are uploaded to a public `equipment-images` Storage bucket; signed loan agreement PDFs go to a private `loan-agreements` bucket, one object per item at `${user_id}/${loan_request_id}/${equipment_id}.pdf`, readable by its owner and by admins.

The `email_log` columns recording the message body and archive CC are added by [`supabase/migrations/20260916010000_email_log_detail.sql`](supabase/migrations/20260916010000_email_log_detail.sql) — run it before deploying the functions, or sends will fail to log.

Every change to those tables is recorded in `audit_log` — see [App audit log](#app-audit-log) below.

A member's home address is masked behind a **Reveal** control on the admin "Member details" screen. It isn't removed, because it's printed on the loan agreement each member signs and is what the club has to go on when hardware doesn't come back — the point is that opening someone's profile to check their Discord handle shouldn't also put their home address on screen. The signed agreement PDF still carries it in full.

Row-level security restricts each table to the rows a user is allowed to see/edit (e.g. members can only read/create their own `loan_requests` and can't edit them after submitting; only admins can review a request or edit `equipment`, `equipment_units`, and `equipment_addons`; only the profile owner can read/write their own `profiles` row).

The `equipment`/`equipment_units` columns and the `equipment_addons` table, RLS policies, and storage bucket/policies are defined in [`supabase/migrations/20260817000000_equipment_inventory.sql`](supabase/migrations/20260817000000_equipment_inventory.sql) — written defensively (`if not exists` throughout) since this repo has no prior migration history to confirm the exact shape already live in Supabase. The `category` column was added afterward in [`supabase/migrations/20260817010000_equipment_category.sql`](supabase/migrations/20260817010000_equipment_category.sql), and the table-level grants (RLS policies alone aren't sufficient — see that migration's comment) in [`supabase/migrations/20260817020000_equipment_grants.sql`](supabase/migrations/20260817020000_equipment_grants.sql). The `loan_requests`/`loan_request_items`/`loan_request_availability` tables, their RLS policies and grants, and the `loan-agreements` bucket are defined in [`supabase/migrations/20260817030000_loan_requests.sql`](supabase/migrations/20260817030000_loan_requests.sql). Run all four via the Supabase SQL editor or CLI against your project, in order. Admin visibility over `profiles` (the "View registered members" and "Member details" screens) comes from [`supabase/migrations/20260916000000_profiles_admin_visibility_fix.sql`](supabase/migrations/20260916000000_profiles_admin_visibility_fix.sql), which supersedes the read/update policies in `20260817040000`/`20260817050000` — those were written as a policy on `profiles` that selects from `profiles`, which Postgres rejects as infinite recursion. Run it too; without it an admin sees only their own row.

## Automated emails

Every automated email is CC'd to an archive address (`synaptechuw@gmail.com` by default) so the club keeps a copy outside the app. Override it per environment with the `EMAIL_ARCHIVE_CC` secret, or set that secret to an empty string to switch the archive copy off. The CC is skipped when the archive address is already the recipient, so it never double-delivers.

The admin "Sent email log" screen (`/adminHome/emails/log`) lists every send — status, template, recipient, CC and timestamp — and opens each row to show the subject, the rendered body exactly as sent, and the provider's error for failures. Failures are logged as well as successes, which is usually what you need to debug one.

The admin "Manage user-facing emails" / "Manage admin-facing emails" screens edit rows in `email_templates` (`key`, `category`, `subject`, `body` — the same text/chip segment array the editor UI builds, `dynamic_fields`, `enabled`). Every send is logged to `email_log`. Both tables, the reminder-tracking columns added to `loan_request_items`, and the Postgres triggers described below are defined in [`supabase/migrations/20260906000000_email_templates.sql`](supabase/migrations/20260906000000_email_templates.sql).

This app has no server of its own — it's Vite + React talking directly to Supabase from the browser — so actually sending an email (which needs a provider API key that can never reach the browser) happens in two Supabase Edge Functions under `supabase/functions/`:

- **`send-email`** — takes `{ event, recordId }`, resolves it to the right template(s)/recipient(s)/dynamic fields, renders, sends via [Resend](https://resend.com), and logs the result. Invoked by Postgres triggers (via `pg_net`) on `profiles` (created, role changed to admin), `loan_request_items` (primary item requested), `loan_requests` (status → `approved`, which this app treats as the handoff event — see that migration's comments), and `equipment` (created/updated). Deployed with JWT verification off and its own `auth: 'secret'` check (via [`@supabase/server`](https://supabase.com/docs/guides/functions/auth)) instead, since its caller — Postgres's `pg_net` — presents a project secret key on `apikey`, not a user JWT.
- **`send-scheduled-reminders`** — runs once a day, computed rather than triggered: finds approved loans due in exactly 7 days, due today, or overdue, and sends `return-reminder-*`/`hardware-item-overdue`. Idempotent via the `reminder_*_sent_at` columns on `loan_request_items`. Still deployed with the platform's default JWT verification — nothing has been wired up yet to call it, so its auth story is revisited once it's actually scheduled.

`successful-return-confirmation` and `hardware-returned` fire on `loan_item.returned`, which the trigger in [`supabase/migrations/20260922000000_loan_item_return.sql`](supabase/migrations/20260922000000_loan_item_return.sql) raises when an admin records a hand-back — redeploy `send-email` after applying that migration, or the event arrives at a function that doesn't know the case and is ignored.

`hardware-return-requested` is the one template still dormant: members have no way to raise a return request in the app yet (returns get arranged over Discord and recorded by an admin), so nothing fires it. (`checkout-request-approval` was in the same situation — no separate approval step for it to fire on — until it was removed entirely.)

### One-time setup

1. Install the Supabase CLI and link this repo to your project (`supabase login`, `supabase link`).
2. Get a [Resend](https://resend.com) API key, then set the Edge Functions' secret:
   ```bash
   supabase secrets set RESEND_API_KEY=re_...
   ```
   Without a verified sending domain, Resend's shared `onboarding@resend.dev` sender only delivers to the Resend account's own email — fine for testing, not for real members. Once you verify a domain, also set `EMAIL_FROM_ADDRESS` (e.g. `Synaptech Hardware <hardware@your-domain.org>`).

   The archive CC defaults to `synaptechuw@gmail.com` with no configuration. To change or disable it:
   ```bash
   supabase secrets set EMAIL_ARCHIVE_CC=someone-else@example.org   # or "" to disable
   ```
   Note the sandbox restriction applies to the CC too: until a domain is verified, Resend will reject a send whose CC isn't the Resend account's own address.
3. Deploy `send-email` with JWT verification off (see above for why):
   ```bash
   supabase functions deploy send-email --no-verify-jwt
   ```
   `send-scheduled-reminders` isn't triggered by anything yet (step 5 below), so it stays on the default `supabase functions deploy send-scheduled-reminders` for now.
4. Run [`supabase/migrations/20260906000000_email_templates.sql`](supabase/migrations/20260906000000_email_templates.sql), [`supabase/migrations/20260916010000_email_log_detail.sql`](supabase/migrations/20260916010000_email_log_detail.sql), and [`supabase/migrations/20260917000000_email_trigger_vault_secrets.sql`](supabase/migrations/20260917000000_email_trigger_vault_secrets.sql) (see that last one for why — in short, `alter database postgres set app.settings.*` needs a privilege the SQL editor's role doesn't have, so the trigger's config lives in [Supabase Vault](https://supabase.com/docs/guides/database/vault) instead) in the SQL editor, in order.
5. Point the trigger at your deployed function and give it a way to authenticate:
   ```sql
   select vault.create_secret(
     'https://<project-ref>.functions.supabase.co',
     'edge_functions_url'
   );
   select vault.create_secret(
     '<a secret key from Settings -> API Keys -> Publishable and secret API keys>',
     'service_role_key'
   );
   ```
   `vault.create_secret(secret, name, description)` — the secret value is the **first** argument, the name second; swapping them stores the name in plaintext and the function can never find its secret by name again. Until both secrets exist, `notify_email_event` silently no-ops — the migrations are harmless to have applied before finishing this step.

   Use a secret key here, not the legacy `service_role` key: it's revocable on its own, without regenerating the project's JWT secret (which would also invalidate the `anon` key the frontend uses). See [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) if your project only has legacy keys so far.
6. Schedule `send-scheduled-reminders` to run daily — via Supabase's Dashboard (Edge Functions → Cron) or `pg_cron` calling it through `pg_net`. Whichever you use, its auth needs the same treatment as `send-email` above (a secret key + `--no-verify-jwt`) unless the scheduling mechanism you pick already authenticates its own calls.

## Hardware loans

The admin "Hardware loans" list (`/adminHome/loans`) searches by item name, serial number or member, filters by state, and opens each row into a loan detail screen at `/adminHome/loans/:id` — the hardware item and its serial, the member with their email and Discord handle, the signed agreement, and whatever action that loan is waiting for:

| State | What the screen shows |
| --- | --- |
| Checkout requested | **Mark as handed off**, the member's checkout availability, and their signed agreement |
| Active / Overdue | **Mark as returned**; the signed agreement, the loan's dates and who checked it out |
| Return requested | **Mark as returned**, the member's return availability, and their signed agreement |
| Returned | When it came back and who received it |
| Denied | The review note |

**Mark as handed off** opens a two-step flow. Step 1 (`/adminHome/loans/:id/hand-off`) opens the camera and waits for the unit's barcode. Either way the result lands on the viewfinder — it blurs behind a green tick or a red cross — so the scan visibly registers rather than the screen just changing. A match holds the tick briefly and continues; a mismatch says why and resumes scanning, distinguishing a label from another unit ("Wrong serial number") from something that isn't club hardware at all ("Not recognised in inventory"). "Manually attest to serial number" is the way past it without a scan, behind a dialog that names the serial and asks the admin to own it. Step 2 is reached only with that verification in its route state — landing on it directly sends you back to step 1.

Scanning uses the browser's `BarcodeDetector` where it exists (Chromium only) and lazily loads a WebAssembly polyfill where it doesn't, which covers Safari, Firefox and every browser on iPhone. The `.wasm` is served from the app's own bundle rather than the package's default CDN, so a strict CSP or a blocked CDN doesn't break it.

For a scan to match, the printed label has to be readable in the first place. The barcode on `SerialBarcodeLabel` is drawn with the "Libre Barcode 128" webfont, which turns characters into bars and computes nothing else — a Code 128 symbol also needs a start character, a modulo-103 checksum and a stop character. [`src/lib/code128.ts`](src/lib/code128.ts) adds them; the human-readable line below the barcode still shows the plain serial. The font size is load-bearing too: the label's barcode box is 491px wide and clips, so the size is set to fit a full 16-character symbol with a quiet zone either side. Printed at 2.5in that gives an X-dimension of about 0.26mm, just above the practical Code 128 minimum — a longer serial format would need the font size reduced again, or a wider label.

Step 2 (`/adminHome/loans/:id/hand-off/agreement`, "Loan agreement sign off") is the admin counterpart to the member's "Sign the Hardware Loan Agreement" step: the same agreement, rendered from the same [`AgreementPreview`](src/components/user-dashboard/AgreementPreview.tsx) in `review` mode, so the admin can check the borrower signed it and that the serial number matches the hardware in their hands. Section 9 reads the borrower's stored signature and date back in the same two-column table the PDF prints them in, and section 10 — which the borrower leaves blank — is where the receiving Hardware Manager types the received date, time and their own name. Confirming calls `handOffLoanRequestItem` with **the typed name**, not the signed-in account's, since section 10 asks who physically handed the hardware over; the typed date and time become the date on the Certificate of Approval, while `reviewed_at` stays the real database timestamp.

Reading section 9 back needs the signature to exist. Until [`supabase/migrations/20260923000000_loan_item_signature.sql`](supabase/migrations/20260923000000_loan_item_signature.sql), the name and date the borrower typed went into the generated PDF and nowhere else; they're now stored on `loan_request_items` as `signature_name`/`signature_date`. Items submitted before that migration have a PDF but no stored values, and the screen shows "Not recorded" rather than deriving a plausible-looking signature from the profile.

`AgreementPreview` is styled to match the generated PDF: an 8.5x11 sheet in a viewer surround, with the Synaptech logo header, the same Bungee/Rubik type at the PDF's point sizes, the same navy and brand blue, the same `#D6E5F8` table fills and hairline borders, and the same 0.75in margins. Both units come from one custom property each (`--in`, `--pt`) derived from the page width, so changing `--doc-width` scales the whole document like a zoom level. Exact line-for-line parity isn't achievable — browsers break lines and kern differently from jsPDF — but every size, colour and margin is the value [`loanAgreementPdf.ts`](src/lib/loanAgreementPdf.ts) uses. Below ~52rem the sheet steps down and the viewer pans, which is what reading the PDF on a phone does too; the member's signing step renders from the same component, so both sides of the hand-off see the same document.

**Mark as returned** is still a placeholder — it renders with the down-and-in diagonal, but nothing is wired behind it yet.

When a checkout bundles several items, each one is a loan in its own right — its own serial, return date and hand-off — so the "Also included in this request" list opens straight into them.

Recording a hand-off happens in the barcode "Check out hardware" flow, which calls `handOffLoanRequestItem`: it stamps a Certificate of Approval onto the member's signed agreement and moves the request to `approved`. Recording a return means setting `loan_request_items.returned_at`, which frees the unit for checkout, closes the loan and sends the member their return confirmation — `markLoanRequestItemReturned` does exactly that, but **nothing in the UI calls it yet**, so the Returned state is currently only reachable by setting the column directly.

## App audit log

The admin "App audit log" screen (`/adminHome/audit-log`) is a single, searchable history of what has happened in the app: who did it, what it affected, and which fields changed. It covers sign-ups, role changes and profile edits; hardware items, units and add-on links being created, edited or removed; checkout requests being submitted, approved, denied or deleted, and the items on them; and edits to the email templates (including a template being turned on or off). Rows are filterable by Members / Inventory / Loans / Emails and open to a detail view with the field-level before-and-after.

Entries are written by Postgres triggers, not by the frontend — see [`supabase/migrations/20260921000000_audit_log.sql`](supabase/migrations/20260921000000_audit_log.sql). This app talks straight to PostgREST from the browser, so a log written by the client would only ever contain what the client remembered to report and would miss anything done from the SQL editor, an Edge Function, or a future second client. The acting user comes from `auth.uid()`, the same mechanism the email triggers rely on; an entry with no actor is genuinely not a signed-in user (a scheduled function, a service-role script, or a direct database change) and the screen shows it as **System**.

A few deliberate limits:

- **Personal details are not copied into the log.** A change to a member's phone number, student ID or address is recorded as having happened, without the old and new values — the audit table is append-only and kept forever, so storing them would create a second permanent copy of data a member can otherwise correct. Non-sensitive fields (role, item name, quantity, replacement value, a template's subject line) keep their full before/after.
- **An email template's body** is recorded as edited rather than diffed; the template itself is the source of truth for how it reads now.
- **`loan_request_availability` is not audited.** One checkout writes dozens of rows there (one per free hour in the 14-day grid) and the grid is already visible in full on the loan detail screen.
- **Emails actually sent are not duplicated here** — they have their own richer surface in `email_log` and the "Sent email log" screen, which keeps the rendered body and the provider's error.
- Logging is fire-and-forget, like `notify_email_event`: if a write to `audit_log` fails it raises a server warning and the original write still succeeds, rather than an admin being unable to add a hardware item because the audit table hiccuped.

The table is admin-readable and has no insert, update or delete policy or grant at all, and the helper functions behind the triggers are revoked from `anon`/`authenticated`, so nothing holding a user's JWT can write, rewrite or erase an entry — not through the table and not through a `SECURITY DEFINER` function. It starts empty: history before the migration was applied was never captured and isn't invented.

### Retention

`audit_log` takes a row for every write the app makes, so it's pruned rather than kept forever: `prune_audit_log(months)` deletes entries older than the given number of months, and the migration schedules it weekly via `pg_cron` (Sundays 03:30 UTC) keeping **12 months**. The screen states the policy under the list, so if you change the interval, change `AUDIT_LOG_RETENTION_MONTHS` in [`src/lib/auditLog.ts`](src/lib/auditLog.ts) to match.

`pg_cron` is available on Supabase but off by default, and the migration doesn't enable it — enabling an extension is a project-level decision, and failing the whole migration over an optional one would be worse. If it isn't on, everything else still applies, the migration prints a notice, and the log simply grows. Turn it on under **Database → Extensions** in the dashboard and re-run the migration to pick up the schedule. To check or change it afterwards:

```sql
select * from cron.job where jobname = 'prune-audit-log';
select cron.schedule('prune-audit-log', '30 3 * * 0', 'select public.prune_audit_log(24)');  -- keep 24 months instead
select public.prune_audit_log(12);  -- run it once, by hand
```

### Applying the migration

Paste these into the Supabase SQL editor in order, the same way the other migrations in this repo have been applied — [`20260921000000_audit_log.sql`](supabase/migrations/20260921000000_audit_log.sql), then [`20260922000000_loan_item_return.sql`](supabase/migrations/20260922000000_loan_item_return.sql) (which redefines one of the audit triggers, so it has to come second), then [`20260923000000_loan_item_signature.sql`](supabase/migrations/20260923000000_loan_item_signature.sql). None needs secrets, and all are safe to re-run.

`supabase db push` is **not** interchangeable here: it applies every local migration the remote `supabase_migrations.schema_migrations` table has no record of, and since this project's migrations were run by hand in the SQL editor, that table doesn't know about them — so a push would attempt to replay all of them, not just this one. Check with `supabase migration list` (read-only) before pushing anything. To move to CLI-managed migrations, mark the already-applied ones with `supabase migration repair --status applied <version>` for each, then `supabase db push` handles this and future migrations normally.

## License

This project is for Synaptech club use and is intended for internal development and demonstration.
