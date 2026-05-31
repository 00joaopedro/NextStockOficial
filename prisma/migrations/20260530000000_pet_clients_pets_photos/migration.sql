CREATE TABLE IF NOT EXISTS "pet_clients" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "document" TEXT,
  "address" JSONB,
  "notes" TEXT,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "pets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "species" TEXT NOT NULL DEFAULT 'dog',
  "breed" TEXT,
  "birth_date" TIMESTAMP(3),
  "age_text" TEXT,
  "weight" TEXT,
  "height" TEXT,
  "width" TEXT,
  "length" TEXT,
  "food_per_day" TEXT,
  "description" TEXT,
  "vaccines_taken" TEXT,
  "vaccines_pending" TEXT,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "pet_photos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "pet_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_url" TEXT,
  "storage_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "agenda_pets" ADD COLUMN IF NOT EXISTS "branch_id" UUID;
ALTER TABLE "agenda_pets" ADD COLUMN IF NOT EXISTS "client_id" UUID;
ALTER TABLE "agenda_pets" ADD COLUMN IF NOT EXISTS "pet_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_clients_tenant_id_fkey'
  ) THEN
    ALTER TABLE "pet_clients"
      ADD CONSTRAINT "pet_clients_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_clients_branch_id_fkey'
  ) THEN
    ALTER TABLE "pet_clients"
      ADD CONSTRAINT "pet_clients_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pets_tenant_id_fkey'
  ) THEN
    ALTER TABLE "pets"
      ADD CONSTRAINT "pets_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pets_client_id_fkey'
  ) THEN
    ALTER TABLE "pets"
      ADD CONSTRAINT "pets_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "pet_clients"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_photos_tenant_id_fkey'
  ) THEN
    ALTER TABLE "pet_photos"
      ADD CONSTRAINT "pet_photos_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_photos_pet_id_fkey'
  ) THEN
    ALTER TABLE "pet_photos"
      ADD CONSTRAINT "pet_photos_pet_id_fkey"
      FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_client_id_fkey'
  ) THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_client_id_fkey"
      FOREIGN KEY ("client_id") REFERENCES "pet_clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_pet_id_fkey'
  ) THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_pet_id_fkey"
      FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_idx" ON "pet_clients"("tenant_id");
CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_branch_id_idx" ON "pet_clients"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_name_idx" ON "pet_clients"("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_phone_idx" ON "pet_clients"("tenant_id", "phone");
CREATE INDEX IF NOT EXISTS "pet_clients_deleted_at_idx" ON "pet_clients"("deleted_at");

CREATE INDEX IF NOT EXISTS "pets_tenant_id_idx" ON "pets"("tenant_id");
CREATE INDEX IF NOT EXISTS "pets_client_id_idx" ON "pets"("client_id");
CREATE INDEX IF NOT EXISTS "pets_tenant_id_client_id_idx" ON "pets"("tenant_id", "client_id");
CREATE INDEX IF NOT EXISTS "pets_deleted_at_idx" ON "pets"("deleted_at");

CREATE INDEX IF NOT EXISTS "pet_photos_tenant_id_idx" ON "pet_photos"("tenant_id");
CREATE INDEX IF NOT EXISTS "pet_photos_pet_id_idx" ON "pet_photos"("pet_id");

CREATE INDEX IF NOT EXISTS "agenda_pets_client_id_idx" ON "agenda_pets"("client_id");
CREATE INDEX IF NOT EXISTS "agenda_pets_pet_id_idx" ON "agenda_pets"("pet_id");
CREATE INDEX IF NOT EXISTS "agenda_pets_branch_id_idx" ON "agenda_pets"("branch_id");
