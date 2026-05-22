CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SystemMode') THEN
    CREATE TYPE "SystemMode" AS ENUM ('visualizacao', 'padrao', 'petshop');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MachineStatus') THEN
    CREATE TYPE "MachineStatus" AS ENUM ('ativa', 'inativa', 'manutencao');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
    CREATE TYPE "PaymentProvider" AS ENUM ('stone', 'pagseguro', 'mercado_pago', 'outro');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_slug_key" ON "plans"("slug");

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "cnpj" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_email" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "mode" "SystemMode" NOT NULL DEFAULT 'visualizacao',
  ADD COLUMN IF NOT EXISTS "current_plan_id" UUID;

CREATE INDEX IF NOT EXISTS "tenants_current_plan_id_idx"
  ON "tenants"("current_plan_id");

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_current_plan_id_fkey"
  FOREIGN KEY ("current_plan_id") REFERENCES "plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "supabase_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "full_name" TEXT,
  ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'Comprador';

UPDATE "profiles"
SET
  "supabase_user_id" = COALESCE("supabase_user_id", "id"),
  "tenant_id" = COALESCE("tenant_id", "primary_tenant_id"),
  "full_name" = COALESCE("full_name", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_supabase_user_id_key"
  ON "profiles"("supabase_user_id");

CREATE INDEX IF NOT EXISTS "profiles_tenant_id_idx"
  ON "profiles"("tenant_id");

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "payment_machines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "model" TEXT NOT NULL,
  "fee_percent" DECIMAL(5,2) NOT NULL,
  "status" "MachineStatus" NOT NULL DEFAULT 'ativa',
  "external_provider" TEXT,
  "external_reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_machines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_machines_tenant_id_idx"
  ON "payment_machines"("tenant_id");

ALTER TABLE "payment_machines"
  ADD CONSTRAINT "payment_machines_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

