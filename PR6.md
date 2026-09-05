## PR 6 — gradual identity migration and safe coexistence

- Adds fail-closed migration flags, defaulting to disabled and dry-run.
- Adds an append-only migration ledger with unique source/subject/kind and CAS claims.
- Adds optional just-in-time migration only after successful legacy Supabase authentication.
- Passwords are held only in memory until legacy authentication succeeds; no password/hash/token is logged or stored in the ledger.
- Adds a sanitized, resumable dry-run batch planner with bounded batches.
- Preserves Supabase, SuperTokens, legacy routes, sessions, tenant/branch authority and rollback by disabling flags.
- No external migration was executed; `local_primary` and `local_only` remain disabled.

### Validation

Node 22.23.1. Git diff checks passed. Prisma, builds and PostgreSQL integration are delegated to CI because this clone has no reliable PostgreSQL and local `node_modules` became incomplete during setup. No staging, production, Railway or Supabase database was accessed.

### Out of scope

PRs 7–10, session conversion, legacy removal, automatic email linking, and production batch apply.
