CREATE TYPE "PaymentProviderCode" AS ENUM ('MERCADO_PAGO','PAGBANK','ASAAS','OTHER');
CREATE TYPE "PaymentConnectionStatus" AS ENUM ('PENDING','ACTIVE','EXPIRED','REVOKED','ERROR');
CREATE TYPE "PaymentTerminalStatus" AS ENUM ('ACTIVE','INACTIVE','MAINTENANCE','OFFLINE');
CREATE TYPE "PaymentMethod" AS ENUM ('PIX','ONLINE_CARD','TERMINAL_CARD','BOLETO');
CREATE TYPE "PaymentRoutingContext" AS ENUM ('CHECKOUT','POS','STOREFRONT');
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING','PROCESSING','APPROVED','REJECTED','CANCELED','REFUNDED','ERROR');
CREATE TYPE "PaymentWebhookProcessingStatus" AS ENUM ('RECEIVED','PROCESSED','FAILED','IGNORED');

CREATE TABLE "payment_connections" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenant_id" UUID NOT NULL, "provider_code" "PaymentProviderCode" NOT NULL,
 "display_name" TEXT NOT NULL, "external_account_id" TEXT, "status" "PaymentConnectionStatus" NOT NULL DEFAULT 'PENDING',
 "capabilities" JSONB, "encrypted_credentials" TEXT, "credentials_expire_at" TIMESTAMP(3), "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
 "last_validated_at" TIMESTAMP(3), "sanitized_error" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "payment_connections_pkey" PRIMARY KEY ("id"), CONSTRAINT "payment_connections_tenant_id_id_key" UNIQUE ("tenant_id","id"),
 CONSTRAINT "payment_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "payment_connections_tenant_id_provider_code_status_idx" ON "payment_connections"("tenant_id","provider_code","status");

CREATE TABLE "payment_terminals" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenant_id" UUID NOT NULL, "branch_id" UUID NOT NULL, "cash_register_code" TEXT,
 "connection_id" UUID, "nickname" TEXT NOT NULL, "provider_code" "PaymentProviderCode" NOT NULL, "manufacturer" TEXT, "model" TEXT,
 "serial_number_masked" TEXT, "external_device_id" TEXT, "status" "PaymentTerminalStatus" NOT NULL DEFAULT 'ACTIVE', "capabilities" JSONB,
 "last_synchronized_at" TIMESTAMP(3), "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "payment_terminals_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "payment_terminals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "payment_terminals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "payment_terminals_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "payment_connections"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_terminals_tenant_id_branch_id_external_device_id_provider_code_key" ON "payment_terminals"("tenant_id","branch_id","external_device_id","provider_code");
CREATE UNIQUE INDEX "payment_terminals_tenant_id_id_key" ON "payment_terminals"("tenant_id","id");
CREATE INDEX "payment_terminals_tenant_id_branch_id_status_idx" ON "payment_terminals"("tenant_id","branch_id","status");
CREATE INDEX "payment_terminals_tenant_id_connection_id_idx" ON "payment_terminals"("tenant_id","connection_id");

CREATE TABLE "payment_routing_preferences" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenant_id" UUID NOT NULL, "connection_id" UUID NOT NULL, "method" "PaymentMethod" NOT NULL,
 "context" "PaymentRoutingContext" NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "payment_routing_preferences_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "payment_routing_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "payment_routing_preferences_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "payment_connections"("tenant_id","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_routing_preferences_tenant_id_method_context_key" ON "payment_routing_preferences"("tenant_id","method","context");
CREATE INDEX "payment_routing_preferences_tenant_id_connection_id_idx" ON "payment_routing_preferences"("tenant_id","connection_id");

CREATE TABLE "payment_transactions" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenant_id" UUID NOT NULL, "order_id" UUID, "sale_id" UUID, "provider_code" "PaymentProviderCode" NOT NULL,
 "connection_id" UUID NOT NULL, "terminal_id" UUID, "external_reference" TEXT NOT NULL, "external_payment_id" TEXT, "method" "PaymentMethod" NOT NULL,
 "amount_cents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'BRL', "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING', "external_status" TEXT,
 "idempotency_key" TEXT NOT NULL, "sanitized_error" TEXT, "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL, "completed_at" TIMESTAMP(3), CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "payment_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "payment_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "payment_transactions_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "payment_connections"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "payment_transactions_tenant_id_terminal_id_fkey" FOREIGN KEY ("tenant_id","terminal_id") REFERENCES "payment_terminals"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "payment_transactions_amount_positive" CHECK ("amount_cents" > 0), CONSTRAINT "payment_transactions_currency_brl" CHECK ("currency" = 'BRL'),
 CONSTRAINT "payment_transactions_target" CHECK ("order_id" IS NOT NULL OR "sale_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "payment_transactions_tenant_id_idempotency_key_key" ON "payment_transactions"("tenant_id","idempotency_key");
CREATE UNIQUE INDEX "payment_transactions_provider_code_external_payment_id_key" ON "payment_transactions"("provider_code","external_payment_id");
CREATE INDEX "payment_transactions_tenant_id_order_id_idx" ON "payment_transactions"("tenant_id","order_id");
CREATE INDEX "payment_transactions_tenant_id_sale_id_idx" ON "payment_transactions"("tenant_id","sale_id");

CREATE TABLE "payment_webhook_events" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "provider_code" "PaymentProviderCode" NOT NULL, "external_event_id" TEXT NOT NULL,
 "signature_validated" BOOLEAN NOT NULL DEFAULT false, "status" "PaymentWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED', "attempts" INTEGER NOT NULL DEFAULT 0,
 "payload_hash" TEXT NOT NULL, "sanitized_payload" JSONB, "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processed_at" TIMESTAMP(3), "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_events_provider_code_external_event_id_key" ON "payment_webhook_events"("provider_code","external_event_id");
CREATE INDEX "payment_webhook_events_status_received_at_idx" ON "payment_webhook_events"("status","received_at");

-- Payment data is backend-only. Prisma scopes every operation and RLS blocks PostgREST roles.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['payment_connections','payment_terminals','payment_routing_preferences','payment_transactions','payment_webhook_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name || '_service_role_all', table_name);
  END LOOP;
END $$;
