-- Multi-tenant security hardening.
-- This migration never deletes or rewrites existing business data.
-- NOT VALID foreign keys protect new writes without blocking on legacy rows.

ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "branch_id" UUID;
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "branch_id" UUID;

CREATE INDEX IF NOT EXISTS "pets_tenant_id_branch_id_idx"
  ON "pets"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "pet_photos_tenant_id_branch_id_idx"
  ON "pet_photos"("tenant_id", "branch_id");

CREATE UNIQUE INDEX IF NOT EXISTS "branches_id_tenant_id_key"
  ON "branches"("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pet_clients_id_tenant_id_branch_id_key"
  ON "pet_clients"("id", "tenant_id", "branch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pets_id_tenant_id_branch_id_key"
  ON "pets"("id", "tenant_id", "branch_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pets_branch_id_fkey') THEN
    ALTER TABLE "pets"
      ADD CONSTRAINT "pets_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_photos_branch_id_fkey') THEN
    ALTER TABLE "pet_photos"
      ADD CONSTRAINT "pet_photos_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_branch_id_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_branch_tenant_fkey') THEN
    ALTER TABLE "tenant_members"
      ADD CONSTRAINT "tenant_members_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id")
      REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_clients_branch_tenant_fkey') THEN
    ALTER TABLE "pet_clients"
      ADD CONSTRAINT "pet_clients_branch_tenant_fkey"
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

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_branch_tenant_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenantId")
      REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_client_tenant_branch_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_client_tenant_branch_fkey"
      FOREIGN KEY ("client_id", "tenantId", "branch_id")
      REFERENCES "pet_clients"("id", "tenant_id", "branch_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_pet_tenant_branch_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_pet_tenant_branch_fkey"
      FOREIGN KEY ("pet_id", "tenantId", "branch_id")
      REFERENCES "pets"("id", "tenant_id", "branch_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
