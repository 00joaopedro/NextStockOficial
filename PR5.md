## PR 5 — Google OAuth and secure identity linking

- Backend Authorization Code flow with state, nonce and PKCE S256.
- Single-use server-side OAuth intents; Google tokens are not persisted or returned.
- Google `sub` is the identity key; matching email never auto-links.
- Explicit linking requires the authenticated active session and rejects conflicts.
- New append-only migration: `20260903000000_google_oauth_intents`.
- Google OAuth is disabled by default and secrets remain server-only.
- SuperTokens, Supabase Auth and legacy routes remain unchanged.

### Validation

Node 22.23.1. `git diff --check` passed. Prisma/build commands were attempted locally but did not complete in this environment; CI must run the PostgreSQL 16 integration/build checks. No staging or production was used.

### Out of scope

PR 6 gradual migration, unlink, and automatic Google provisioning.
