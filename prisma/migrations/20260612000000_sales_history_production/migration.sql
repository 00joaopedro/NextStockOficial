DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleStatus') THEN
    CREATE TYPE "SaleStatus" AS ENUM ('pending', 'paid', 'canceled', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleDocumentType') THEN
    CREATE TYPE "SaleDocumentType" AS ENUM ('receipt', 'nfce65', 'nfe55');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SaleDocumentStatus') THEN
    CREATE TYPE "SaleDocumentStatus" AS ENUM ('draft', 'processing', 'authorized', 'rejected', 'canceled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalePaymentStatus') THEN
    CREATE TYPE "SalePaymentStatus" AS ENUM ('pending', 'approved', 'failed', 'refunded');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "sales" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "order_id" UUID,
  "seller_id" UUID,
  "seller_name_snapshot" TEXT NOT NULL,
  "payment_method" TEXT NOT NULL,
  "payment_machine_id" UUID,
  "payment_machine_name_snapshot" TEXT,
  "document_type" "SaleDocumentType" NOT NULL DEFAULT 'receipt',
  "document_number" TEXT,
  "status" "SaleStatus" NOT NULL DEFAULT 'paid',
  "subtotal_cents" INTEGER NOT NULL,
  "discount_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL,
  "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "canceled_at" TIMESTAMP(3),
  "canceled_by_id" UUID,
  "cancellation_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_amounts_check" CHECK (
    "subtotal_cents" >= 0
    AND "discount_cents" >= 0
    AND "total_cents" >= 0
    AND "discount_cents" <= "subtotal_cents"
  )
);

CREATE TABLE IF NOT EXISTS "sale_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" UUID NOT NULL,
  "product_id" UUID,
  "product_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT,
  "barcode_snapshot" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "total_price_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_items_values_check" CHECK (
    "quantity" > 0
    AND "unit_price_cents" >= 0
    AND "total_price_cents" >= 0
  )
);

CREATE TABLE IF NOT EXISTS "sale_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" UUID NOT NULL,
  "payment_method" TEXT NOT NULL,
  "payment_machine_id" UUID,
  "payment_machine_name_snapshot" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "status" "SalePaymentStatus" NOT NULL DEFAULT 'approved',
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_payments_amount_check" CHECK ("amount_cents" >= 0)
);

CREATE TABLE IF NOT EXISTS "sale_documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" UUID NOT NULL,
  "type" "SaleDocumentType" NOT NULL,
  "number" TEXT,
  "series" TEXT,
  "access_key" TEXT,
  "status" "SaleDocumentStatus" NOT NULL DEFAULT 'draft',
  "xml_path" TEXT,
  "pdf_path" TEXT,
  "issued_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_order_id_key" ON "sales"("order_id");
CREATE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_sold_at_idx" ON "sales"("tenant_id", "branch_id", "sold_at");
CREATE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_seller_id_idx" ON "sales"("tenant_id", "branch_id", "seller_id");
CREATE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_status_idx" ON "sales"("tenant_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "sales_order_id_idx" ON "sales"("order_id");
CREATE INDEX IF NOT EXISTS "sale_items_sale_id_idx" ON "sale_items"("sale_id");
CREATE INDEX IF NOT EXISTS "sale_items_product_id_idx" ON "sale_items"("product_id");
CREATE INDEX IF NOT EXISTS "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");
CREATE INDEX IF NOT EXISTS "sale_payments_payment_machine_id_idx" ON "sale_payments"("payment_machine_id");
CREATE INDEX IF NOT EXISTS "sale_documents_sale_id_type_status_idx" ON "sale_documents"("sale_id", "type", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_tenant_id_fkey') THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_branch_id_fkey') THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_id_fkey') THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_seller_id_fkey') THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_seller_id_fkey"
      FOREIGN KEY ("seller_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_canceled_by_id_fkey') THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_canceled_by_id_fkey"
      FOREIGN KEY ("canceled_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_machine_id_fkey') THEN
    ALTER TABLE "sales"
      ADD CONSTRAINT "sales_payment_machine_id_fkey"
      FOREIGN KEY ("payment_machine_id") REFERENCES "payment_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_sale_id_fkey') THEN
    ALTER TABLE "sale_items"
      ADD CONSTRAINT "sale_items_sale_id_fkey"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_product_id_fkey') THEN
    ALTER TABLE "sale_items"
      ADD CONSTRAINT "sale_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_sale_id_fkey') THEN
    ALTER TABLE "sale_payments"
      ADD CONSTRAINT "sale_payments_sale_id_fkey"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_payments_payment_machine_id_fkey') THEN
    ALTER TABLE "sale_payments"
      ADD CONSTRAINT "sale_payments_payment_machine_id_fkey"
      FOREIGN KEY ("payment_machine_id") REFERENCES "payment_machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_sale_id_fkey') THEN
    ALTER TABLE "sale_documents"
      ADD CONSTRAINT "sale_documents_sale_id_fkey"
      FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_documents" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sales', 'sale_items', 'sale_payments', 'sale_documents']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        table_name || '_service_role_all',
        table_name
      );
    END IF;
  END LOOP;
END
$$;
