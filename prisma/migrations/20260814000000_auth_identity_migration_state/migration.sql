ALTER TABLE "auth_identities"
  ADD COLUMN "migration_state" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "password_strategy" TEXT,
  ADD COLUMN "last_migration_attempt_at" TIMESTAMP(3),
  ADD COLUMN "reconciliation_reason" TEXT;

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_migration_state_check"
  CHECK ("migration_state" IN (
    'NOT_REQUIRED', 'MIGRATION_PENDING', 'MIGRATED',
    'PASSWORD_RESET_REQUIRED', 'RECONCILIATION_REQUIRED'
  ));

CREATE INDEX "auth_identities_migration_state_idx"
  ON "auth_identities"("migration_state");
