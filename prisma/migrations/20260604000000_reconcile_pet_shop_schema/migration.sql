-- Reconcile Pet Shop tables that may have been created partially outside Prisma.
-- This migration is additive and idempotent. It never deletes or rewrites business data.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

ALTER TABLE "pet_clients"
  ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "branch_id" UUID,
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "document" TEXT,
  ADD COLUMN IF NOT EXISTS "address" JSONB,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "pets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
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

ALTER TABLE "pets"
  ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "branch_id" UUID,
  ADD COLUMN IF NOT EXISTS "client_id" UUID,
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "species" TEXT DEFAULT 'dog',
  ADD COLUMN IF NOT EXISTS "breed" TEXT,
  ADD COLUMN IF NOT EXISTS "birth_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "age_text" TEXT,
  ADD COLUMN IF NOT EXISTS "weight" TEXT,
  ADD COLUMN IF NOT EXISTS "height" TEXT,
  ADD COLUMN IF NOT EXISTS "width" TEXT,
  ADD COLUMN IF NOT EXISTS "length" TEXT,
  ADD COLUMN IF NOT EXISTS "food_per_day" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "vaccines_taken" TEXT,
  ADD COLUMN IF NOT EXISTS "vaccines_pending" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "pet_photos" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "pet_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_url" TEXT,
  "storage_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "pet_photos"
  ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "branch_id" UUID,
  ADD COLUMN IF NOT EXISTS "pet_id" UUID,
  ADD COLUMN IF NOT EXISTS "file_name" TEXT,
  ADD COLUMN IF NOT EXISTS "file_url" TEXT,
  ADD COLUMN IF NOT EXISTS "storage_path" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "agenda_pets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "cliente" TEXT NOT NULL,
  "animal" TEXT NOT NULL,
  "atendente" TEXT NOT NULL,
  "servico" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "hora" TEXT NOT NULL,
  "preco" DOUBLE PRECISION NOT NULL,
  "descricao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId" UUID NOT NULL,
  "branch_id" UUID,
  "client_id" UUID,
  "pet_id" UUID
);

ALTER TABLE "agenda_pets"
  ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS "cliente" TEXT,
  ADD COLUMN IF NOT EXISTS "animal" TEXT,
  ADD COLUMN IF NOT EXISTS "atendente" TEXT,
  ADD COLUMN IF NOT EXISTS "servico" TEXT,
  ADD COLUMN IF NOT EXISTS "data" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hora" TEXT,
  ADD COLUMN IF NOT EXISTS "preco" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "descricao" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "tenantId" UUID,
  ADD COLUMN IF NOT EXISTS "branch_id" UUID,
  ADD COLUMN IF NOT EXISTS "client_id" UUID,
  ADD COLUMN IF NOT EXISTS "pet_id" UUID;

CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_idx"
  ON "pet_clients"("tenant_id");
CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_branch_id_idx"
  ON "pet_clients"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "pet_clients_deleted_at_idx"
  ON "pet_clients"("deleted_at");

CREATE INDEX IF NOT EXISTS "pets_tenant_id_idx"
  ON "pets"("tenant_id");
CREATE INDEX IF NOT EXISTS "pets_tenant_id_branch_id_idx"
  ON "pets"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "pets_client_id_idx"
  ON "pets"("client_id");
CREATE INDEX IF NOT EXISTS "pets_deleted_at_idx"
  ON "pets"("deleted_at");

CREATE INDEX IF NOT EXISTS "pet_photos_tenant_id_idx"
  ON "pet_photos"("tenant_id");
CREATE INDEX IF NOT EXISTS "pet_photos_tenant_id_branch_id_idx"
  ON "pet_photos"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "pet_photos_pet_id_idx"
  ON "pet_photos"("pet_id");

CREATE INDEX IF NOT EXISTS "agenda_pets_tenantId_idx"
  ON "agenda_pets"("tenantId");
CREATE INDEX IF NOT EXISTS "agenda_pets_branch_id_idx"
  ON "agenda_pets"("branch_id");
CREATE INDEX IF NOT EXISTS "agenda_pets_client_id_idx"
  ON "agenda_pets"("client_id");
CREATE INDEX IF NOT EXISTS "agenda_pets_pet_id_idx"
  ON "agenda_pets"("pet_id");
