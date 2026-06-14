-- Additive production hardening for profile billing and payment machines.
-- This migration does not delete, backfill, or rewrite existing business data.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM (
      'pending',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'pending',
  "provider" TEXT,
  "provider_subscription_id" TEXT,
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "trial_ends_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_machines"
  ADD COLUMN IF NOT EXISTS "created_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "subscriptions_tenant_id_status_idx"
  ON "subscriptions"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_idx"
  ON "subscriptions"("plan_id");
CREATE INDEX IF NOT EXISTS "subscriptions_provider_provider_subscription_id_idx"
  ON "subscriptions"("provider", "provider_subscription_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_reference_key"
  ON "subscriptions"("provider", "provider_subscription_id")
  WHERE "provider" IS NOT NULL AND "provider_subscription_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_one_effective_per_tenant_key"
  ON "subscriptions"("tenant_id")
  WHERE "status" IN ('trialing', 'active', 'past_due');

CREATE INDEX IF NOT EXISTS "payment_machines_tenant_id_branch_id_status_idx"
  ON "payment_machines"("tenant_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "payment_machines_created_by_id_idx"
  ON "payment_machines"("created_by_id");
CREATE INDEX IF NOT EXISTS "payment_machines_updated_by_id_idx"
  ON "payment_machines"("updated_by_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "payment_machines"
    WHERE "deleted_at" IS NULL AND "branch_id" IS NOT NULL
    GROUP BY
      "tenant_id",
      "branch_id",
      lower(btrim("name")),
      "provider",
      lower(btrim("model"))
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_machines_active_identity_key"
      ON "payment_machines"(
        "tenant_id",
        "branch_id",
        lower(btrim("name")),
        "provider",
        lower(btrim("model"))
      )
      WHERE "deleted_at" IS NULL AND "branch_id" IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "payment_machines"
    WHERE "deleted_at" IS NULL
      AND "external_provider" IS NOT NULL
      AND "external_reference" IS NOT NULL
    GROUP BY "external_provider", "external_reference"
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_machines_external_reference_key"
      ON "payment_machines"("external_provider", "external_reference")
      WHERE "deleted_at" IS NULL
        AND "external_provider" IS NOT NULL
        AND "external_reference" IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenant_id_fkey') THEN
    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_fkey') THEN
    ALTER TABLE "subscriptions"
      ADD CONSTRAINT "subscriptions_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_machines_created_by_id_fkey') THEN
    ALTER TABLE "payment_machines"
      ADD CONSTRAINT "payment_machines_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_machines_updated_by_id_fkey') THEN
    ALTER TABLE "payment_machines"
      ADD CONSTRAINT "payment_machines_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
      AND policyname = 'subscriptions_service_role_all'
  ) THEN
    CREATE POLICY subscriptions_service_role_all
      ON public.subscriptions
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
