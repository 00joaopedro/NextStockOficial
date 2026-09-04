CREATE TABLE "auth_migration_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_provider" TEXT NOT NULL,
  "source_subject_hash" TEXT NOT NULL,
  "profile_id" UUID,
  "auth_identity_id" UUID,
  "migration_kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "claim_token" TEXT,
  "source_version" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_migration_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_migration_ledger_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_migration_ledger_auth_identity_id_fkey" FOREIGN KEY ("auth_identity_id") REFERENCES "auth_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "auth_migration_ledger_source_provider_source_subject_hash_migration_kind_key" ON "auth_migration_ledger"("source_provider", "source_subject_hash", "migration_kind");
CREATE INDEX "auth_migration_ledger_status_updated_at_idx" ON "auth_migration_ledger"("status", "updated_at");
CREATE INDEX "auth_migration_ledger_profile_id_idx" ON "auth_migration_ledger"("profile_id");
