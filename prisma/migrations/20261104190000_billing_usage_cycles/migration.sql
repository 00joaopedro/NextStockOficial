ALTER TABLE "provider_usage_samples" ADD COLUMN IF NOT EXISTS "rate_cents_brl" DECIMAL(18,6);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_tenant_id_id_key" ON "billing_invoices"("tenant_id", "id");
CREATE TABLE IF NOT EXISTS "usage_metering_state" (
  "key" TEXT PRIMARY KEY,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
INSERT INTO "usage_metering_state" ("key") VALUES ('cycle-v1') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "billing_usage_cycles" (
  "invoice_id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "cost_cents" INTEGER,
  "reason" TEXT,
  "evidence" JSONB,
  "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_usage_cycles_invoice_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "billing_invoices"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "billing_usage_cycles_interval_check" CHECK ("period_start" < "period_end"),
  CONSTRAINT "billing_usage_cycles_status_check" CHECK (("status" = 'ESTIMATED' AND "cost_cents" >= 0 AND "cost_cents" IS NOT NULL) OR ("status" = 'UNAVAILABLE' AND "cost_cents" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_usage_cycles_tenant_id_invoice_id_key" ON "billing_usage_cycles"("tenant_id", "invoice_id");
CREATE INDEX IF NOT EXISTS "billing_usage_cycles_tenant_id_period_end_idx" ON "billing_usage_cycles"("tenant_id", "period_end");
ALTER TABLE "billing_usage_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_metering_state" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "billing_usage_cycles", "usage_metering_state" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "billing_usage_cycles", "usage_metering_state" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "billing_usage_cycles", "usage_metering_state" FROM authenticated;
  END IF;
END $$;
