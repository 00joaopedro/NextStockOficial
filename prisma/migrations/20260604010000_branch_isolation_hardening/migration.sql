-- Branch isolation hardening.
-- Additive migration: it never backfills, deletes, or rewrites business data.
-- Legacy Product/PaymentMachine rows with branch_id NULL remain intentionally
-- invisible to branch-scoped services until they are audited and assigned.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "branch_id" UUID;
ALTER TABLE "payment_machines" ADD COLUMN IF NOT EXISTS "branch_id" UUID;

DROP INDEX IF EXISTS "products_tenant_id_sku_key";
DROP INDEX IF EXISTS "products_tenant_id_barcode_key";

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_branch_id_sku_key"
  ON "products"("tenant_id", "branch_id", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_branch_id_barcode_key"
  ON "products"("tenant_id", "branch_id", "barcode");
CREATE INDEX IF NOT EXISTS "products_tenant_id_branch_id_idx"
  ON "products"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "products_tenant_id_branch_id_category_idx"
  ON "products"("tenant_id", "branch_id", "category");
CREATE INDEX IF NOT EXISTS "payment_machines_tenant_id_branch_id_idx"
  ON "payment_machines"("tenant_id", "branch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "branches_id_tenant_id_key"
  ON "branches"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pet_clients_id_tenant_id_branch_id_key"
  ON "pet_clients"("id", "tenant_id", "branch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pets_id_tenant_id_branch_id_key"
  ON "pets"("id", "tenant_id", "branch_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_branch_id_fkey') THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_branch_tenant_fkey') THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id")
      REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_machines_branch_id_fkey') THEN
    ALTER TABLE "payment_machines"
      ADD CONSTRAINT "payment_machines_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_machines_branch_tenant_fkey') THEN
    ALTER TABLE "payment_machines"
      ADD CONSTRAINT "payment_machines_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id")
      REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_branch_tenant_fkey') THEN
    ALTER TABLE "tenant_members"
      ADD CONSTRAINT "tenant_members_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id")
      REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pets_client_tenant_branch_fkey') THEN
    ALTER TABLE "pets"
      ADD CONSTRAINT "pets_client_tenant_branch_fkey"
      FOREIGN KEY ("client_id", "tenant_id", "branch_id")
      REFERENCES "pet_clients"("id", "tenant_id", "branch_id")
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_photos_pet_tenant_branch_fkey') THEN
    ALTER TABLE "pet_photos"
      ADD CONSTRAINT "pet_photos_pet_tenant_branch_fkey"
      FOREIGN KEY ("pet_id", "tenant_id", "branch_id")
      REFERENCES "pets"("id", "tenant_id", "branch_id")
      ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
