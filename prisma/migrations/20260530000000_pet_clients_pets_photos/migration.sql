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

ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "branch_id" UUID;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "document" TEXT;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "address" JSONB;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "pet_clients" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "pet_clients" SET "id" = gen_random_uuid() WHERE "id" IS NULL;
UPDATE "pet_clients" SET "name" = 'Cliente Pet' WHERE "name" IS NULL;
UPDATE "pet_clients" SET "phone" = 'Nao informado' WHERE "phone" IS NULL;
UPDATE "pet_clients" SET "created_at" = CURRENT_TIMESTAMP WHERE "created_at" IS NULL;
UPDATE "pet_clients" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;

ALTER TABLE "pet_clients" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "pet_clients" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "pet_clients" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "pet_clients" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "pet_clients" ALTER COLUMN "updated_at" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pet_clients" WHERE "tenant_id" IS NULL) THEN
    ALTER TABLE "pet_clients" ALTER COLUMN "tenant_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'pet_clients.tenant_id still has NULL values; keeping column nullable until data is fixed.';
  END IF;
END $$;

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

ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "client_id" UUID;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "species" TEXT DEFAULT 'dog';
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "breed" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "birth_date" TIMESTAMP(3);
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "age_text" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "weight" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "height" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "width" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "length" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "food_per_day" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "vaccines_taken" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "vaccines_pending" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "pets" SET "id" = gen_random_uuid() WHERE "id" IS NULL;
UPDATE "pets" SET "name" = 'Animal' WHERE "name" IS NULL;
UPDATE "pets" SET "species" = 'dog' WHERE "species" IS NULL;
UPDATE "pets" SET "created_at" = CURRENT_TIMESTAMP WHERE "created_at" IS NULL;
UPDATE "pets" SET "updated_at" = CURRENT_TIMESTAMP WHERE "updated_at" IS NULL;

ALTER TABLE "pets" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "pets" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "pets" ALTER COLUMN "species" SET NOT NULL;
ALTER TABLE "pets" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "pets" ALTER COLUMN "updated_at" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pets" WHERE "tenant_id" IS NULL) THEN
    ALTER TABLE "pets" ALTER COLUMN "tenant_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'pets.tenant_id still has NULL values; keeping column nullable until data is fixed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "pets" WHERE "client_id" IS NULL) THEN
    ALTER TABLE "pets" ALTER COLUMN "client_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'pets.client_id still has NULL values; keeping column nullable until data is fixed.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "pet_photos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "pet_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_url" TEXT,
  "storage_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "tenant_id" UUID;
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "pet_id" UUID;
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "file_name" TEXT;
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "file_url" TEXT;
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "storage_path" TEXT;
ALTER TABLE "pet_photos" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "pet_photos" SET "id" = gen_random_uuid() WHERE "id" IS NULL;
UPDATE "pet_photos" SET "file_name" = 'pet-photo' WHERE "file_name" IS NULL;
UPDATE "pet_photos" SET "created_at" = CURRENT_TIMESTAMP WHERE "created_at" IS NULL;

ALTER TABLE "pet_photos" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "pet_photos" ALTER COLUMN "file_name" SET NOT NULL;
ALTER TABLE "pet_photos" ALTER COLUMN "created_at" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pet_photos" WHERE "tenant_id" IS NULL) THEN
    ALTER TABLE "pet_photos" ALTER COLUMN "tenant_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'pet_photos.tenant_id still has NULL values; keeping column nullable until data is fixed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "pet_photos" WHERE "pet_id" IS NULL) THEN
    ALTER TABLE "pet_photos" ALTER COLUMN "pet_id" SET NOT NULL;
  ELSE
    RAISE NOTICE 'pet_photos.pet_id still has NULL values; keeping column nullable until data is fixed.';
  END IF;
END $$;

ALTER TABLE "agenda_pets" ADD COLUMN IF NOT EXISTS "branch_id" UUID;
ALTER TABLE "agenda_pets" ADD COLUMN IF NOT EXISTS "client_id" UUID;
ALTER TABLE "agenda_pets" ADD COLUMN IF NOT EXISTS "pet_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_clients_tenant_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "pet_clients"
        ADD CONSTRAINT "pet_clients_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping pet_clients_tenant_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_clients_branch_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "pet_clients"
        ADD CONSTRAINT "pet_clients_branch_id_fkey"
        FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping pet_clients_branch_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pets_tenant_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "pets"
        ADD CONSTRAINT "pets_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping pets_tenant_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pets_client_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "pets"
        ADD CONSTRAINT "pets_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "pet_clients"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping pets_client_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_photos_tenant_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "pet_photos"
        ADD CONSTRAINT "pet_photos_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping pet_photos_tenant_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pet_photos_pet_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "pet_photos"
        ADD CONSTRAINT "pet_photos_pet_id_fkey"
        FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping pet_photos_pet_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_client_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "agenda_pets"
        ADD CONSTRAINT "agenda_pets_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "pet_clients"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping agenda_pets_client_id_fkey because existing data/schema is not ready.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_pet_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE "agenda_pets"
        ADD CONSTRAINT "agenda_pets_pet_id_fkey"
        FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION
      WHEN foreign_key_violation OR undefined_table OR duplicate_object THEN
        RAISE NOTICE 'Skipping agenda_pets_pet_id_fkey because existing data/schema is not ready.';
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_idx" ON "pet_clients"("tenant_id");
CREATE INDEX IF NOT EXISTS "pet_clients_branch_id_idx" ON "pet_clients"("branch_id");
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
