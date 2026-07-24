-- RC-001: persistent claim before creating an external PIX payment.
CREATE TYPE "PaymentIdempotencyOperationType" AS ENUM ('CREATE_PIX');
CREATE TYPE "PaymentIdempotencyExecutionState" AS ENUM (
  'CLAIMED',
  'PROCESSING',
  'UNKNOWN',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_FINAL'
);

-- Composite unique indexes make tenant ownership enforceable by foreign keys.
CREATE UNIQUE INDEX "orders_tenant_id_id_key" ON "orders"("tenant_id", "id");
CREATE UNIQUE INDEX "sales_tenant_id_id_key" ON "sales"("tenant_id", "id");
CREATE UNIQUE INDEX "payment_transactions_tenant_id_id_key"
  ON "payment_transactions"("tenant_id", "id");

CREATE TABLE "payment_idempotency_executions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "operation_type" "PaymentIdempotencyOperationType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "provider_code" "PaymentProviderCode" NOT NULL,
  "connection_id" UUID NOT NULL,
  "external_reference" TEXT NOT NULL,
  "external_payment_id" TEXT,
  "state" "PaymentIdempotencyExecutionState" NOT NULL DEFAULT 'CLAIMED',
  "claim_token" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "provider_started_at" TIMESTAMP(3),
  "order_id" UUID,
  "sale_id" UUID,
  "transaction_id" UUID,
  "failure_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "payment_idempotency_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_idempotency_executions_target_check"
    CHECK ("order_id" IS NOT NULL OR "sale_id" IS NOT NULL),
  CONSTRAINT "payment_idempotency_executions_request_hash_check"
    CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_idempotency_executions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_tenant_id_connection_id_fkey"
    FOREIGN KEY ("tenant_id", "connection_id")
    REFERENCES "payment_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_tenant_id_order_id_fkey"
    FOREIGN KEY ("tenant_id", "order_id")
    REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_tenant_id_sale_id_fkey"
    FOREIGN KEY ("tenant_id", "sale_id")
    REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_idempotency_executions_tenant_id_transaction_id_fkey"
    FOREIGN KEY ("tenant_id", "transaction_id")
    REFERENCES "payment_transactions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_idempotency_executions_tenant_operation_key_key"
  ON "payment_idempotency_executions"("tenant_id", "operation_type", "idempotency_key");
CREATE UNIQUE INDEX "payment_idempotency_executions_transaction_id_key"
  ON "payment_idempotency_executions"("transaction_id");
CREATE UNIQUE INDEX "payment_idempotency_executions_tenant_transaction_id_key"
  ON "payment_idempotency_executions"("tenant_id", "transaction_id");
CREATE INDEX "payment_idempotency_executions_tenant_state_lease_idx"
  ON "payment_idempotency_executions"("tenant_id", "state", "lease_expires_at");
CREATE INDEX "payment_idempotency_executions_tenant_order_idx"
  ON "payment_idempotency_executions"("tenant_id", "order_id");
CREATE INDEX "payment_idempotency_executions_tenant_sale_idx"
  ON "payment_idempotency_executions"("tenant_id", "sale_id");

ALTER TABLE "payment_idempotency_executions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "payment_idempotency_executions" FROM anon, authenticated;
CREATE POLICY "payment_idempotency_executions_service_role_all"
  ON "payment_idempotency_executions"
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
