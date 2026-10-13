-- Billing idempotency hardening: fail closed if legacy duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM billing_payments
    WHERE gateway_payment_id IS NOT NULL
    GROUP BY provider, gateway_payment_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate billing payment gateway identities must be reconciled before this migration';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM billing_payments
    GROUP BY external_reference
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate billing payment external references must be reconciled before this migration';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE "BillingSubscriptionOperationState" AS ENUM (
    'CLAIMED',
    'PROCESSING',
    'UNKNOWN',
    'SUCCEEDED',
    'FAILED_RETRYABLE',
    'FAILED_FINAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "promotion_reservations"
  ADD COLUMN IF NOT EXISTS "checkout_claim_token" UUID,
  ADD COLUMN IF NOT EXISTS "checkout_claim_expires_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "billing_subscription_operations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'CANCEL',
  "state" "BillingSubscriptionOperationState" NOT NULL DEFAULT 'CLAIMED',
  "claim_token" UUID,
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "failure_code" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_subscription_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscription_operations_tenant_subscription_operation_key"
  ON "billing_subscription_operations" ("tenant_id", "subscription_id", "operation");
CREATE INDEX IF NOT EXISTS "billing_subscription_operations_tenant_state_lease_idx"
  ON "billing_subscription_operations" ("tenant_id", "state", "lease_expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_payments_provider_gateway_payment_id_key"
  ON "billing_payments" ("provider", "gateway_payment_id")
  WHERE "gateway_payment_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "billing_payments_external_reference_key"
  ON "billing_payments" ("external_reference");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_checkout_intents_active_subscription_key"
  ON "billing_checkout_intents" ("subscription_id")
  WHERE "state" IN ('CLAIMED', 'PROCESSING');
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_active_subscription_key"
  ON "checkout_sessions" ("subscription_id")
  WHERE "subscription_id" IS NOT NULL
    AND "status" IN ('OPEN', 'PENDING');

CREATE INDEX IF NOT EXISTS "promotion_reservations_checkout_claim_idx"
  ON "promotion_reservations" ("checkout_claim_token", "checkout_claim_expires_at");

DO $$ BEGIN
  ALTER TABLE "billing_subscription_operations"
    ADD CONSTRAINT "billing_subscription_operations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "billing_subscription_operations"
    ADD CONSTRAINT "billing_subscription_operations_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
