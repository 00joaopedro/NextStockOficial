# SuperTokens activation and identity migration

This runbook prepares activation only. Supabase Auth remains the default and no
real user, hash, or provider was accessed by this change.

## Official compatibility and limits

The official NestJS integration documents `supertokens-node` and
`supertokens-nestjs`, with explicit Express/Fastify framework selection:
https://supertokens.com/docs/quickstart/integrations/nestjs. The Node backend
SDK documents Fastify support: https://supertokens.com/docs/nodejs/modules/framework.html.
The official npm package currently lists `supertokens-node` 24.0.3 as latest;
this repository intentionally does not add or initialize it until a real-Core
staging integration is approved, so no SDK compatibility claim is made for the
current dependency tree.
The official migration guide requires a self-hosted Core or Managed service and
an API key for migration API calls:
https://supertokens.com/docs/migration/overview.
SuperTokens documents import of standard BCrypt and Argon2 hashes through its
import-user API, and dynamic migration during login:
https://supertokens.com/docs/migration/legacy/account-creation/user-creation.
Session migration is a separate endpoint/flow; cookies must not be copied:
https://supertokens.com/docs/migration/session-migration.
Supabase documents BCrypt/Argon2 export/import for its own admin API, but does
not provide a one-size-fits-all SuperTokens export:
https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects.

The project therefore supports only validated BCrypt/Argon2 input in an offline
dry-run. No bulk mutation, password storage, or remote import is performed here.
Account linking, recovery, session conversion, and Core API calls remain gated
behind a future real-Core integration and reconciliation evidence.

## Modes and configuration

`AUTH_PROVIDER_MODE` defaults to `supabase_only` and accepts `coexistence`,
`supertokens_primary`, and `supertokens_only`. The latter requires
`AUTH_MIGRATION_ENABLED=true`; `AUTH_LEGACY_FALLBACK_ENABLED` defaults to true.
Configure only through deployment secrets: `SUPERTOKENS_CONNECTION_URI`,
`SUPERTOKENS_API_KEY`, `SUPERTOKENS_APP_NAME`, `SUPERTOKENS_API_DOMAIN`, and
`SUPERTOKENS_WEBSITE_DOMAIN`. Never log these values.

SuperTokens Core must use its own isolated PostgreSQL database/schema. It must
not share the NextStock Prisma database or Storage buckets. `UserProfile.id`,
`AuthIdentity`, canonical email, tenant/branch/membership roles,
`nextstock_session`, RC-009, SEC-016, audit outbox, cookies, CSRF and CSP remain
application authorities.

## Offline import and rollout

Provide a sanitized local JSON export and run:

```text
node scripts/auth/supertokens-password-import.ts export.json --dry-run
```

The command validates only standard BCrypt/Argon2 formats and reports counts and
algorithms, never hashes or PII. A future mutating importer must add checkpoint,
idempotency by provider/subject, external-create/local-bind compensation, and a
reconciliation task before it can be enabled.

Rollout is `supabase_only` → `coexistence` → `supertokens_primary` →
`supertokens_only`. Roll back to `coexistence` on Core outage, reconciliation
backlog, recovery failure, legacy sessions outside the approved window, or any
metric/audit outage. Supabase Auth is not disabled by this runbook.

## Cutover gates

Before `supertokens_only`, independently verify zero unlinked Supabase
identities, zero ambiguous/reconciliation identities, unique canonical emails,
resolved password strategy for every account, no legacy sessions beyond the
window, tested SuperTokens recovery, valid Core configuration/connectivity, and
healthy metrics/audit outbox. The gate command must be read-only by default and
fail closed; no real cutover is claimed by this change.
