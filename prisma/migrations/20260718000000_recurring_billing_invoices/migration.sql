-- Recurring, gateway-neutral invoice ledger. Additive and safe for existing payments.
DO $$ BEGIN
  CREATE TYPE "BillingInvoiceStatus" AS ENUM ('OPEN', 'PENDING', 'PAID', 'OVERDUE', 'VOID', 'REFUNDED', 'CHARGEBACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL,
  "gateway_invoice_id" TEXT,
  "external_reference" TEXT NOT NULL,
  "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "period_started_at" TIMESTAMP(3) NOT NULL,
  "period_ends_at" TIMESTAMP(3),
  "due_at" TIMESTAMP(3),
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "paid_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "billing_payments" ADD COLUMN IF NOT EXISTS "invoice_id" UUID;
ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "last_reconciled_at" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_subscription_period_key" ON "billing_invoices"("subscription_id", "period_started_at");
CREATE INDEX IF NOT EXISTS "billing_invoices_tenant_status_due_idx" ON "billing_invoices"("tenant_id", "status", "due_at");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_provider_gateway_key" ON "billing_invoices"("provider", "gateway_invoice_id") WHERE "gateway_invoice_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "billing_payments_invoice_id_idx" ON "billing_payments"("invoice_id");
CREATE INDEX IF NOT EXISTS "checkout_sessions_last_reconciled_idx" ON "checkout_sessions"("last_reconciled_at");

ALTER TABLE "billing_invoices" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "billing_invoices_service_role_all" ON "billing_invoices" FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Product rule: after the exact 15-day trial, only a confirmed paid period grants access.
UPDATE "subscriptions"
SET "grace_ends_at" = NULL
WHERE "status" <> 'active';
