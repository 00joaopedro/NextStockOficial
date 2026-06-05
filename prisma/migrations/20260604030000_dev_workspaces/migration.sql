-- Dev SuperAdmin contexts are isolated by system type.
-- This migration is additive and does not move or delete customer data.

CREATE TABLE IF NOT EXISTS "dev_workspaces" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dev_user_id" UUID NOT NULL,
  "system_type" "SystemType" NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "is_default_workspace" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "dev_workspaces_dev_user_id_system_type_key"
  ON "dev_workspaces"("dev_user_id", "system_type");
CREATE INDEX IF NOT EXISTS "dev_workspaces_tenant_id_idx"
  ON "dev_workspaces"("tenant_id");
CREATE INDEX IF NOT EXISTS "dev_workspaces_branch_id_idx"
  ON "dev_workspaces"("branch_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_workspaces_dev_user_id_fkey'
  ) THEN
    ALTER TABLE "dev_workspaces"
      ADD CONSTRAINT "dev_workspaces_dev_user_id_fkey"
      FOREIGN KEY ("dev_user_id") REFERENCES "profiles"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_workspaces_tenant_id_fkey'
  ) THEN
    ALTER TABLE "dev_workspaces"
      ADD CONSTRAINT "dev_workspaces_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_workspaces_branch_id_fkey'
  ) THEN
    ALTER TABLE "dev_workspaces"
      ADD CONSTRAINT "dev_workspaces_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dev_workspaces_branch_tenant_fkey'
  ) THEN
    ALTER TABLE "dev_workspaces"
      ADD CONSTRAINT "dev_workspaces_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id")
      REFERENCES "branches"("id", "tenant_id")
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
