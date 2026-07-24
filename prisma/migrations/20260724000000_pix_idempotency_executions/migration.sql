-- RC-001: claim PIX creation before invoking an external provider.
-- Expand-only migration: existing payment transactions are not modified or backfilled.
CREATE TYPE "PaymentIdempotencyOperationType" AS ENUM ('PIX_CREATE');
CREATE TYPE "PaymentIdempotencyExecutionStatus" AS ENUM (
  'CLAIMED',
  'PROCESSING',
  'UNKNOWN',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL'
);

CREATE TABLE "payment_idempotency_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "operation_type" "PaymentIdempotencyOperationType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "provider_code" "PaymentProviderCode" NOT NULL,
  "connection_id" UUID NOT NULL,
  "order_id" UUID,
  "sale_id" UUID,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "status" "PaymentIdempotencyExecutionStatus" NOT NULL DEFAULT 'CLAIMED',
  "external_reference" TEXT NOT NULL,
  "external_payment_id" TEXT,
  "transaction_id" UUID,
  "claim_token" TEXT,
  "lease_until" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 1,
  "last_error_code" TEXT,
  "reconciliation_metadata" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_idempotency_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_idempotency_executions_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "payment_idempotency_executions_currency_brl" CHECK ("currency" = 'BRL'),
  CONSTRAINT "payment_idempotency_executions_target" CHECK (
    ("order_id" IS NOT NULL AND "sale_id" IS NULL) OR
    ("order_id" IS NULL AND "sale_id" IS NOT NULL)
  ),
  CONSTRAINT "payment_idempotency_executions_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_connection_fkey"
    FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "payment_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_order_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_sale_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_transaction_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_idempotency_executions_scope_key"
  ON "payment_idempotency_executions"("tenant_id", "operation_type", "idempotency_key");
CREATE UNIQUE INDEX "payment_idempotency_executions_external_reference_key"
  ON "payment_idempotency_executions"("external_reference");
CREATE UNIQUE INDEX "payment_idempotency_executions_transaction_id_key"
  ON "payment_idempotency_executions"("transaction_id") WHERE "transaction_id" IS NOT NULL;
CREATE UNIQUE INDEX "payment_idempotency_executions_provider_external_payment_key"
  ON "payment_idempotency_executions"("provider_code", "external_payment_id") WHERE "external_payment_id" IS NOT NULL;
CREATE INDEX "payment_idempotency_executions_status_lease_idx"
  ON "payment_idempotency_executions"("status", "lease_until");
CREATE INDEX "payment_idempotency_executions_tenant_order_idx"
  ON "payment_idempotency_executions"("tenant_id", "order_id");

ALTER TABLE "payment_idempotency_executions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "payment_idempotency_executions" FROM anon, authenticated;
CREATE POLICY "payment_idempotency_executions_service_role_all"
  ON "payment_idempotency_executions" FOR ALL TO service_role USING (true) WITH CHECK (true);
