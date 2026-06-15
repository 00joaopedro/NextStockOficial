-- Additive PDV hardening. Existing sales remain valid and untouched.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleSource') THEN
    CREATE TYPE "SaleSource" AS ENUM ('cash_register', 'order');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleDiscountType') THEN
    CREATE TYPE "SaleDiscountType" AS ENUM ('percentage', 'fixed');
  END IF;
END
$$;

ALTER TABLE "sales"
  ADD COLUMN IF NOT EXISTS "source" "SaleSource",
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "cash_session_id" UUID,
  ADD COLUMN IF NOT EXISTS "discount_type" "SaleDiscountType",
  ADD COLUMN IF NOT EXISTS "discount_value" DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS "paid_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "change_cents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sale_payments"
  ADD COLUMN IF NOT EXISTS "payment_machine_provider" "PaymentProvider",
  ADD COLUMN IF NOT EXISTS "payment_machine_model" TEXT,
  ADD COLUMN IF NOT EXISTS "payment_machine_fee_percent" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "external_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "external_reference" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_idempotency_key_key"
  ON "sales"("tenant_id", "branch_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "sales_cash_session_id_idx"
  ON "sales"("cash_session_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_totals_check'
  ) THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_payment_totals_check"
      CHECK (
        "paid_cents" >= "total_cents"
        AND "change_cents" >= 0
        AND "change_cents" = "paid_cents" - "total_cents"
      ) NOT VALID;
  END IF;
END
$$;
