# AGENTS.md

Guidance for AI coding agents working in this repository.

The project guidance is kept in a single place: **[CLAUDE.md](CLAUDE.md)**. Read it before making changes — it covers the commands (build, lint, test, single test), the architecture (no backend of our own: browser → Supabase, with authoritative work in Postgres triggers and Edge Functions), the two type families, the shared domain logic to reuse, how migrations are applied, and the deployment constraints.

Keeping one file avoids the two drifting apart. If you add project guidance, add it to `CLAUDE.md` rather than here.

[README.md](README.md) is the long-form domain reference (hardware loans, inventory audits, the email pipeline, the app audit log).
