-- Align the old Profile/SuperAdmin schema with the current Supabase Auth
-- multi-tenant model used by NextStock.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SystemType') THEN
    CREATE TYPE "SystemType" AS ENUM ('padrao', 'petshop');
  END IF;
END
$$;

ALTER TABLE "tenants"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "system_type" "SystemType" NOT NULL DEFAULT 'padrao',
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_tenantId_fkey";
DROP INDEX IF EXISTS "profiles_tenantId_idx";

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "access_name_normalized" TEXT,
  ADD COLUMN IF NOT EXISTS "primary_tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "profiles"
SET
  "email" = COALESCE("email", "id"::TEXT || '@local.nextstock'),
  "name" = COALESCE("name", split_part(COALESCE("email", "id"::TEXT), '@', 1)),
  "access_name_normalized" = COALESCE(
    "access_name_normalized",
    lower(split_part(COALESCE("email", "id"::TEXT), '@', 1))
  ),
  "primary_tenant_id" = COALESCE("primary_tenant_id", "tenantId")
WHERE "name" IS NULL
  OR "access_name_normalized" IS NULL
  OR "primary_tenant_id" IS NULL;

ALTER TABLE "profiles"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "access_name_normalized" SET NOT NULL,
  DROP COLUMN IF EXISTS "role",
  DROP COLUMN IF EXISTS "tenantId";

DROP INDEX IF EXISTS "profiles_access_name_normalized_key";
CREATE UNIQUE INDEX "profiles_access_name_normalized_key"
  ON "profiles"("access_name_normalized");

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_primary_tenant_id_fkey"
  FOREIGN KEY ("primary_tenant_id") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "profiles_primary_tenant_id_idx"
  ON "profiles"("primary_tenant_id");

DROP TYPE IF EXISTS "Role";
CREATE TYPE "Role" AS ENUM ('Admin', 'Vendedor', 'Comprador');

CREATE TABLE IF NOT EXISTS "branches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_id_slug_key"
  ON "branches"("tenant_id", "slug");
CREATE INDEX IF NOT EXISTS "branches_tenant_id_idx"
  ON "branches"("tenant_id");

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "tenant_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_profile_id" UUID NOT NULL,
  "branch_id" UUID,
  "role" "Role" NOT NULL DEFAULT 'Comprador',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_members_tenant_id_user_profile_id_key"
  ON "tenant_members"("tenant_id", "user_profile_id");
CREATE INDEX IF NOT EXISTS "tenant_members_user_profile_id_idx"
  ON "tenant_members"("user_profile_id");
CREATE INDEX IF NOT EXISTS "tenant_members_branch_id_idx"
  ON "tenant_members"("branch_id");

ALTER TABLE "tenant_members"
  ADD CONSTRAINT "tenant_members_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_members"
  ADD CONSTRAINT "tenant_members_user_profile_id_fkey"
  FOREIGN KEY ("user_profile_id") REFERENCES "profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_members"
  ADD CONSTRAINT "tenant_members_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agenda_pets"
  ADD CONSTRAINT "agenda_pets_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
