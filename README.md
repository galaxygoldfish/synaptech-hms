# Synaptech HMS

Synaptech HMS is a hardware management system for the Synaptech club. Members browse the equipment inventory and request hardware; admins hand it out, take it back, and keep the inventory accurate.

## Features

- **Members:** browse inventory, request a checkout (with a signed loan agreement and pickup availability), and see the hardware they currently have out
- **Admins:** review requests, check hardware out and back in by barcode, manage inventory and printable labels, audit the storage facility, and manage members and automated emails
- Google sign-in restricted to `@uw.edu` accounts, with separate admin and member experiences
- An app-wide audit log of every change

## Tech stack

React 19, TypeScript and Vite, with Supabase (Postgres, Auth, Storage, Edge Functions) as the backend. React Router v7, Vitest and React Testing Library, Oxlint. Deployed to Cloudflare.

## Getting started

You need Node.js (see [`.nvmrc`](.nvmrc)) and a Supabase project with the [migrations](supabase/migrations) applied.

```bash
npm install
```

Create `.env.local` (gitignored):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

```bash
npm run dev
```

Other scripts: `npm run build` (type-check and build), `npm run test:run` (tests), `npm run lint`, `npm run preview`.

## More detail

How the code is organised, how it's deployed, and how the database, emails, loans, audits and audit log work are in [AGENTS.md](AGENTS.md).

## License

This project is for Synaptech club use and is intended for internal development and demonstration.
