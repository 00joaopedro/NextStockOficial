CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "branches"
ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "branches"
SET
  "is_default" = COALESCE("is_default", false),
  "is_active" = COALESCE("is_active", true),
  "created_at" = COALESCE("created_at", CURRENT_TIMESTAMP),
  "updated_at" = COALESCE("updated_at", CURRENT_TIMESTAMP);

ALTER TABLE "branches"
ALTER COLUMN "is_default" SET DEFAULT false,
ALTER COLUMN "is_default" SET NOT NULL,
ALTER COLUMN "is_active" SET DEFAULT true,
ALTER COLUMN "is_active" SET NOT NULL,
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET NOT NULL,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "branches_tenant_id_is_active_idx"
ON "branches"("tenant_id", "is_active");

CREATE INDEX IF NOT EXISTS "branches_tenant_id_is_default_idx"
ON "branches"("tenant_id", "is_default");
