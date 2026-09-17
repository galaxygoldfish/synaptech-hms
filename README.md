# Synaptech HMS

Synaptech HMS is a hardware management system for Synaptech that helps the club track and organize its equipment. The platform supports both an admin experience and a member experience so inventory can be managed efficiently while members can check out hardware when needed.

## Features

- Admin-side dashboard for managing hardware inventory and club operations
- Member-side dashboard for viewing current hardware loans and requesting checkouts
- Google OAuth sign-in restricted to `@uw.edu` accounts, with role-based routing
- Centralized views for inventory status and actions

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

These model the *request* phase the checkout flow in this app actually captures (submit → admin approves/denies). Once approved, that's the natural point to create an `active`/`overdue`/`returned`-style `loans` row tracking the physical checkout of the assigned `equipment_units` row — not built yet, since nothing in the app surfaces that lifecycle today.

Product photos are uploaded to a public `equipment-images` Storage bucket; signed loan agreement PDFs go to a private `loan-agreements` bucket, one object per item at `${user_id}/${loan_request_id}/${equipment_id}.pdf`, readable by its owner and by admins.

Row-level security restricts each table to the rows a user is allowed to see/edit (e.g. members can only read/create their own `loan_requests` and can't edit them after submitting; only admins can review a request or edit `equipment`, `equipment_units`, and `equipment_addons`; only the profile owner can read/write their own `profiles` row).

The `equipment`/`equipment_units` columns and the `equipment_addons` table, RLS policies, and storage bucket/policies are defined in [`supabase/migrations/20260817000000_equipment_inventory.sql`](supabase/migrations/20260817000000_equipment_inventory.sql) — written defensively (`if not exists` throughout) since this repo has no prior migration history to confirm the exact shape already live in Supabase. The `category` column was added afterward in [`supabase/migrations/20260817010000_equipment_category.sql`](supabase/migrations/20260817010000_equipment_category.sql), and the table-level grants (RLS policies alone aren't sufficient — see that migration's comment) in [`supabase/migrations/20260817020000_equipment_grants.sql`](supabase/migrations/20260817020000_equipment_grants.sql). The `loan_requests`/`loan_request_items`/`loan_request_availability` tables, their RLS policies and grants, and the `loan-agreements` bucket are defined in [`supabase/migrations/20260817030000_loan_requests.sql`](supabase/migrations/20260817030000_loan_requests.sql). Run all four via the Supabase SQL editor or CLI against your project, in order. Admin visibility over `profiles` (the "View registered members" and "Member details" screens) comes from [`supabase/migrations/20260916000000_profiles_admin_visibility_fix.sql`](supabase/migrations/20260916000000_profiles_admin_visibility_fix.sql), which supersedes the read/update policies in `20260817040000`/`20260817050000` — those were written as a policy on `profiles` that selects from `profiles`, which Postgres rejects as infinite recursion. Run it too; without it an admin sees only their own row.

## Automated emails

The admin "Manage user-facing emails" / "Manage admin-facing emails" screens edit rows in `email_templates` (`key`, `category`, `subject`, `body` — the same text/chip segment array the editor UI builds, `dynamic_fields`, `enabled`). Every send is logged to `email_log`. Both tables, the reminder-tracking columns added to `loan_request_items`, and the Postgres triggers described below are defined in [`supabase/migrations/20260906000000_email_templates.sql`](supabase/migrations/20260906000000_email_templates.sql).

This app has no server of its own — it's Vite + React talking directly to Supabase from the browser — so actually sending an email (which needs a provider API key that can never reach the browser) happens in two Supabase Edge Functions under `supabase/functions/`:

- **`send-email`** — takes `{ event, recordId }`, resolves it to the right template(s)/recipient(s)/dynamic fields, renders, sends via [Resend](https://resend.com), and logs the result. Invoked by Postgres triggers (via `pg_net`) on `profiles` (created, role changed to admin), `loan_request_items` (primary item requested), `loan_requests` (status → `approved`, which this app treats as the handoff event — see that migration's comments), and `equipment` (created/updated).
- **`send-scheduled-reminders`** — runs once a day, computed rather than triggered: finds approved loans due in exactly 7 days, due today, or overdue, and sends `return-reminder-*`/`hardware-item-overdue`. Idempotent via the `reminder_*_sent_at` columns on `loan_request_items`.

Not every template has a trigger yet: `checkout-request-approval`, `hardware-return-requested`, `successful-return-confirmation`, and `hardware-returned` are editable from the UI but stay dormant, because there's no separate approval step or return-request/return-completion flow in the app yet for them to fire on.

### One-time setup

1. Install the Supabase CLI and link this repo to your project (`supabase login`, `supabase link`).
2. Get a [Resend](https://resend.com) API key, then set the Edge Functions' secret:
   ```bash
   supabase secrets set RESEND_API_KEY=re_...
   ```
   Without a verified sending domain, Resend's shared `onboarding@resend.dev` sender only delivers to the Resend account's own email — fine for testing, not for real members. Once you verify a domain, also set `EMAIL_FROM_ADDRESS` (e.g. `Synaptech Hardware <hardware@your-domain.org>`).
3. Deploy both functions:
   ```bash
   supabase functions deploy send-email
   supabase functions deploy send-scheduled-reminders
   ```
4. Schedule `send-scheduled-reminders` to run daily — via Supabase's Dashboard (Edge Functions → Cron) or `pg_cron` calling it through `pg_net`.
5. Point the database triggers at your deployed functions (new connections only — reconnect after running this):
   ```sql
   alter database postgres set app.settings.edge_functions_url = 'https://<project-ref>.functions.supabase.co';
   alter database postgres set app.settings.service_role_key = '<service-role-key-from-project-settings>';
   ```
   Until both settings are set, `notify_email_event` silently no-ops — the triggers exist and are harmless to have applied before finishing this setup.

## License

This project is for Synaptech club use and is intended for internal development and demonstration.
