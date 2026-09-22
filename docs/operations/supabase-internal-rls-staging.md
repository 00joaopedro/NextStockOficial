# Supabase internal table RLS staging validation

No database connection was available during implementation, so runtime and migration
roles remain unclassified. Do not apply the new migration in staging until the
following preflight passes. Keep connection strings in the platform's protected
environment; run the verification SQL separately in the runtime and migration
connection contexts without putting URLs in shell arguments or logs.

Run `sql/audit/supabase_internal_rls_staging_verification.sql` once using the
application's `DATABASE_URL` connection and once using the exact migration
connection (`ADMIN_DATABASE_URL`, or `DIRECT_URL` when that is what the migration
runner uses). Before applying the migration, verify for every existing target table:

- the runtime role and migration role are each `superuser`, `BYPASSRLS`, or the table
  owner; otherwise RLS will block those connections because this migration creates
  no policy for either database role;
- the migration connection can read and write `_prisma_migrations`;
- the runtime role's needed SELECT, INSERT, UPDATE, and DELETE privileges remain;
- the migration role has the privileges needed by Prisma Migrate;
- no target has `FORCE ROW LEVEL SECURITY` enabled.

The pre-migration report may show existing grants to `anon` or `authenticated`;
record that output securely as the ACL rollback reference. After migration, verify
that all four privileges are false for both API roles on every existing target table.

If either application connection is an ordinary role that is not the table owner and
does not have `BYPASSRLS`, stop before applying the migration. Do not add a broad RLS
policy to compensate; review a least-privilege database role design first.

After the preflight passes, apply the migration only through the controlled staging
migration job. Then rerun the verification SQL in both connection contexts, run the
login and password recovery smoke checks, and confirm `/api/health` and
`/api/health/ready`. Confirm Prisma Migrate can still read `_prisma_migrations` with
the migration connection. Production remains a separate, manually controlled step.
