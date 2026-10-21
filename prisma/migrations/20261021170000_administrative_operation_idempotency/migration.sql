CREATE TABLE "administrative_operation_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_scope" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_operation_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "administrative_operation_executions_tenant_scope_operation_idempotency_key_key"
ON "administrative_operation_executions"("tenant_scope", "operation", "idempotency_key");

CREATE INDEX "administrative_operation_executions_tenant_scope_operation_target_id_idx"
ON "administrative_operation_executions"("tenant_scope", "operation", "target_id");
