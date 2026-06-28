-- Gateway-agnostic SaaS billing. Additive, with a one-time tenant trial backfill.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'payment_pending';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'suspended';

DO $$ BEGIN
  CREATE TYPE "PlanInterval" AS ENUM ('MONTHLY', 'YEARLY', 'LIFETIME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PaymentGatewayProvider" AS ENUM ('MERCADO_PAGO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CheckoutSessionStatus" AS ENUM ('OPEN', 'PENDING', 'COMPLETED', 'EXPIRED', 'CANCELED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'REFUNDED', 'CHARGEBACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "GatewayWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "BillingEventType" AS ENUM (
    'TRIAL_STARTED', 'TRIAL_EXPIRED', 'CHECKOUT_CREATED', 'CHECKOUT_COMPLETED',
    'CHECKOUT_FAILED', 'PAYMENT_PENDING', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
    'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK', 'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_CANCELED', 'SUBSCRIPTION_SUSPENDED',
    'PLAN_CHANGED', 'MIGRATION_BACKFILL', 'MANUAL_RECONCILIATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS "interval" "PlanInterval" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "interval_count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "features" JSONB,
  ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "plans_is_active_sort_order_idx"
  ON "plans"("is_active", "sort_order");

ALTER TABLE "subscriptions"
  ALTER COLUMN "plan_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "trial_started_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "grace_ends_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gateway_provider" "PaymentGatewayProvider",
  ADD COLUMN IF NOT EXISTS "last_payment_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "subscriptions"
SET "gateway_provider" = 'MERCADO_PAGO'
WHERE "provider" = 'mercado_pago' AND "gateway_provider" IS NULL;

CREATE TABLE "gateway_plan_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" UUID NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "gateway_plan_id" TEXT,
  "payment_link_url" TEXT,
  "mode" TEXT NOT NULL DEFAULT 'production',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gateway_plan_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gateway_plan_mappings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "gateway_plan_mappings_plan_provider_mode_key"
  ON "gateway_plan_mappings"("plan_id", "provider", "mode");
CREATE INDEX "gateway_plan_mappings_provider_gateway_plan_mode_idx"
  ON "gateway_plan_mappings"("provider", "gateway_plan_id", "mode");
CREATE UNIQUE INDEX "gateway_plan_mappings_provider_plan_mode_key"
  ON "gateway_plan_mappings"("provider", "gateway_plan_id", "mode")
  WHERE "gateway_plan_id" IS NOT NULL;

CREATE TABLE "checkout_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "subscription_id" UUID,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "gateway_checkout_id" TEXT,
  "checkout_url" TEXT NOT NULL,
  "external_reference" TEXT NOT NULL,
  "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'OPEN',
  "expected_amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "expires_at" TIMESTAMP(3),
  "created_by_id" UUID,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "checkout_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "checkout_sessions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "checkout_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "checkout_sessions_external_reference_key" ON "checkout_sessions"("external_reference");
CREATE INDEX "checkout_sessions_tenant_status_created_idx" ON "checkout_sessions"("tenant_id", "status", "created_at");
CREATE INDEX "checkout_sessions_plan_id_idx" ON "checkout_sessions"("plan_id");
CREATE INDEX "checkout_sessions_provider_gateway_checkout_idx" ON "checkout_sessions"("provider", "gateway_checkout_id");

CREATE TABLE "billing_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "subscription_id" UUID,
  "plan_id" UUID NOT NULL,
  "checkout_session_id" UUID,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "gateway_payment_id" TEXT,
  "external_reference" TEXT NOT NULL,
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "raw_gateway_status" TEXT,
  "paid_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_payments_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "billing_payments_provider_gateway_payment_key"
  ON "billing_payments"("provider", "gateway_payment_id")
  WHERE "gateway_payment_id" IS NOT NULL;
CREATE INDEX "billing_payments_tenant_status_created_idx" ON "billing_payments"("tenant_id", "status", "created_at");
CREATE INDEX "billing_payments_checkout_session_id_idx" ON "billing_payments"("checkout_session_id");
CREATE INDEX "billing_payments_external_reference_idx" ON "billing_payments"("external_reference");

CREATE TABLE "gateway_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "PaymentGatewayProvider" NOT NULL,
  "gateway_event_id" TEXT,
  "resource_id" TEXT,
  "event_type" TEXT,
  "request_id" TEXT,
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "payload_hash" TEXT NOT NULL,
  "raw_payload" JSONB,
  "processing_status" "GatewayWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "processed_at" TIMESTAMP(3),
  "processing_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gateway_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gateway_webhook_events_provider_event_key"
  ON "gateway_webhook_events"("provider", "gateway_event_id")
  WHERE "gateway_event_id" IS NOT NULL;
CREATE INDEX "gateway_webhook_events_payload_hash_idx" ON "gateway_webhook_events"("payload_hash");
CREATE INDEX "gateway_webhook_events_provider_event_idx" ON "gateway_webhook_events"("provider", "gateway_event_id");
CREATE INDEX "gateway_webhook_events_status_created_idx" ON "gateway_webhook_events"("processing_status", "created_at");

CREATE TABLE "billing_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "subscription_id" UUID,
  "payment_id" UUID,
  "checkout_session_id" UUID,
  "type" "BillingEventType" NOT NULL,
  "previous_state" JSONB,
  "next_state" JSONB,
  "actor_profile_id" UUID,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_events_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "billing_events_tenant_created_idx" ON "billing_events"("tenant_id", "created_at");
CREATE INDEX "billing_events_type_created_idx" ON "billing_events"("type", "created_at");

-- Preserve trial truth (tenant creation date) while allowing a separate rollout grace.
INSERT INTO "subscriptions" (
  "id", "tenant_id", "plan_id", "status", "trial_started_at", "trial_ends_at",
  "grace_ends_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), t."id", NULL,
  CASE WHEN t."created_at" + INTERVAL '15 days' > CURRENT_TIMESTAMP
    THEN 'trialing'::"SubscriptionStatus"
    ELSE 'expired'::"SubscriptionStatus"
  END,
  t."created_at", t."created_at" + INTERVAL '15 days',
  CURRENT_TIMESTAMP + INTERVAL '15 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "subscriptions" s WHERE s."tenant_id" = t."id"
);

INSERT INTO "billing_events" (
  "tenant_id", "subscription_id", "type", "source", "metadata"
)
SELECT
  s."tenant_id", s."id", 'MIGRATION_BACKFILL', 'migration',
  jsonb_build_object('trialDerivedFromTenantCreatedAt', true, 'rolloutGraceDays', 15)
FROM "subscriptions" s
WHERE s."trial_started_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "billing_events" e
    WHERE e."subscription_id" = s."id" AND e."type" = 'MIGRATION_BACKFILL'
  );

DROP INDEX IF EXISTS "subscriptions_one_effective_per_tenant_key";
CREATE UNIQUE INDEX "subscriptions_one_current_per_tenant_key"
  ON "subscriptions"("tenant_id")
  WHERE "status" IN ('pending', 'trialing', 'payment_pending', 'active', 'past_due', 'suspended');
CREATE UNIQUE INDEX "subscriptions_one_trial_per_tenant_key"
  ON "subscriptions"("tenant_id")
  WHERE "trial_started_at" IS NOT NULL;

ALTER TABLE "gateway_plan_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gateway_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_plan_mappings_service_role_all" ON "gateway_plan_mappings" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "checkout_sessions_service_role_all" ON "checkout_sessions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "billing_payments_service_role_all" ON "billing_payments" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "gateway_webhook_events_service_role_all" ON "gateway_webhook_events" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "billing_events_service_role_all" ON "billing_events" FOR ALL TO service_role USING (true) WITH CHECK (true);
