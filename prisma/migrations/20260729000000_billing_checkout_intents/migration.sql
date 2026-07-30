CREATE TYPE "BillingCheckoutIntentState" AS ENUM ('CLAIMED', 'PROCESSING', 'UNKNOWN', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL');

CREATE TABLE "billing_checkout_intents" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'CREATE_CHECKOUT',
  "idempotency_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "external_reference" TEXT NOT NULL,
  "state" "BillingCheckoutIntentState" NOT NULL DEFAULT 'CLAIMED',
  "claim_token" UUID NOT NULL,
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "checkout_session_id" UUID,
  "failure_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_checkout_intents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_checkout_intents_external_reference_key" ON "billing_checkout_intents"("external_reference");
CREATE UNIQUE INDEX "billing_checkout_intents_checkout_session_id_key" ON "billing_checkout_intents"("checkout_session_id");
CREATE UNIQUE INDEX "billing_checkout_intents_tenant_id_operation_idempotency_key_key" ON "billing_checkout_intents"("tenant_id", "operation", "idempotency_key");
CREATE INDEX "billing_checkout_intents_tenant_id_state_lease_expires_at_idx" ON "billing_checkout_intents"("tenant_id", "state", "lease_expires_at");
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
