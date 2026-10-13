CREATE TYPE "BillingRefundIntentState" AS ENUM (
  'CLAIMED',
  'PROCESSING',
  'UNKNOWN',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL'
);

CREATE TABLE "billing_refund_intents" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'REFUND',
  "state" "BillingRefundIntentState" NOT NULL DEFAULT 'CLAIMED',
  "claim_token" UUID NOT NULL,
  "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "failure_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_refund_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_refund_intents_tenant_payment_operation_key"
  ON "billing_refund_intents" ("tenant_id", "payment_id", "operation");

CREATE INDEX "billing_refund_intents_tenant_state_lease_idx"
  ON "billing_refund_intents" ("tenant_id", "state", "lease_expires_at");

ALTER TABLE "billing_refund_intents"
  ADD CONSTRAINT "billing_refund_intents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "billing_payments_id_tenant_id_key"
  ON "billing_payments" ("id", "tenant_id");

ALTER TABLE "billing_refund_intents"
  ADD CONSTRAINT "billing_refund_intents_payment_id_tenant_id_fkey"
  FOREIGN KEY ("payment_id", "tenant_id")
  REFERENCES "billing_payments"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
