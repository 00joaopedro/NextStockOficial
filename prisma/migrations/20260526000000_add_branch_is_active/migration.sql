ALTER TABLE "branches"
ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "branches_tenant_id_is_active_idx"
ON "branches"("tenant_id", "is_active");
