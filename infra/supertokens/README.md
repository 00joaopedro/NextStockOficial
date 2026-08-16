# SuperTokens Core — rehearsal package

This package is intentionally optional and is not started by NextStock. It uses
the official `supertokens/supertokens-postgresql` image pinned to `11.0` and a
dedicated PostgreSQL 16 database. The Core database must never be the Prisma
database and no Core tables belong in `prisma/schema.prisma`.

Only a secret manager may provide `SUPERTOKENS_CONNECTION_URI`,
`SUPERTOKENS_API_KEY`, `SUPERTOKENS_DB_USER`, `SUPERTOKENS_DB_PASSWORD`, and
`SUPERTOKENS_DB_NAME`. Do not put values in this repository or in shell history.

The official `/hello` endpoint is both liveness and readiness: it returns 200
only when the Core can reach its database. The compose file exposes it only on
loopback, persists the database volume, uses restart-on-failure semantics, and
sets conservative development limits.

Operationally, take a PostgreSQL logical/base backup before an upgrade, stop
the Core, apply the sequential migrations documented in the release changelog,
start it, and verify `/hello` plus a rehearsal. Rollback means stopping the
Core, restoring the last verified database backup, and returning the app to
`supabase_only` or `coexistence`; never delete `AuthIdentity` automatically.

Official references (consulted 2026-08-15):

- https://supertokens.com/docs/deployment/self-host-supertokens
- https://supertokens.com/docs/migration/legacy/account-creation/user-creation
- https://supertokens.com/docs/authentication/email-password/password-hashing
- https://supertokens.com/docs/references/updating-supertokens
- https://supertokens.com/docs/post-authentication/account-linking/introduction

The Node SDK is not added in this phase: the existing HTTP seam is deliberate,
and no Core is contacted by CI or by this repository's tests.
