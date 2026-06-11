DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierStatus') THEN
    CREATE TYPE "SupplierStatus" AS ENUM ('active', 'inactive', 'blocked');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupplierPersonType') THEN
    CREATE TYPE "SupplierPersonType" AS ENUM ('individual', 'company');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "legal_name" TEXT NOT NULL,
  "trade_name" TEXT,
  "person_type" "SupplierPersonType" NOT NULL,
  "document" TEXT,
  "state_registration" TEXT,
  "main_contact" TEXT,
  "phone" TEXT NOT NULL,
  "whatsapp" TEXT,
  "email" TEXT,
  "site" TEXT,
  "zip_code" TEXT,
  "city" TEXT,
  "state" TEXT,
  "district" TEXT,
  "street" TEXT,
  "number" TEXT,
  "complement" TEXT,
  "average_delivery_time" TEXT,
  "product_categories" TEXT,
  "payment_terms" TEXT,
  "status" "SupplierStatus" NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "suppliers_tenant_id_branch_id_idx"
  ON "suppliers"("tenant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "suppliers_tenant_id_branch_id_status_idx"
  ON "suppliers"("tenant_id", "branch_id", "status");

CREATE INDEX IF NOT EXISTS "suppliers_tenant_id_branch_id_legal_name_idx"
  ON "suppliers"("tenant_id", "branch_id", "legal_name");

CREATE INDEX IF NOT EXISTS "suppliers_tenant_id_branch_id_document_idx"
  ON "suppliers"("tenant_id", "branch_id", "document");

CREATE INDEX IF NOT EXISTS "suppliers_deleted_at_idx"
  ON "suppliers"("deleted_at");

CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_tenant_branch_document_active_key"
  ON "suppliers"("tenant_id", "branch_id", "document")
  WHERE "deleted_at" IS NULL AND "document" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_tenant_id_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_branch_id_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_created_by_id_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_updated_by_id_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_branch_tenant_fkey') THEN
    ALTER TABLE "suppliers"
      ADD CONSTRAINT "suppliers_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
