DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM (
      'pending',
      'paid',
      'preparing',
      'delivered',
      'canceled',
      'refunded'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderPaymentMethod') THEN
    CREATE TYPE "OrderPaymentMethod" AS ENUM (
      'pix',
      'credit_card',
      'debit_card',
      'cash',
      'other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "customer_name" TEXT NOT NULL,
  "customer_document" TEXT,
  "customer_phone" TEXT,
  "customer_email" TEXT,
  "payment_method" "OrderPaymentMethod" NOT NULL DEFAULT 'other',
  "status" "OrderStatus" NOT NULL DEFAULT 'pending',
  "subtotal_cents" INTEGER NOT NULL,
  "discount_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL,
  "notes" TEXT,
  "delivered_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "cancellation_reason" TEXT,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name_snapshot" TEXT NOT NULL,
  "sku_snapshot" TEXT,
  "barcode_snapshot" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "total_price_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_id_fkey') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_branch_id_fkey') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_created_by_id_fkey') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_updated_by_id_fkey') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
    ALTER TABLE "order_items"
      ADD CONSTRAINT "order_items_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey') THEN
    ALTER TABLE "order_items"
      ADD CONSTRAINT "order_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "orders_tenant_id_branch_id_created_at_idx"
  ON "orders"("tenant_id", "branch_id", "created_at");

CREATE INDEX IF NOT EXISTS "orders_tenant_id_branch_id_status_idx"
  ON "orders"("tenant_id", "branch_id", "status");

CREATE INDEX IF NOT EXISTS "orders_tenant_id_branch_id_customer_name_idx"
  ON "orders"("tenant_id", "branch_id", "customer_name");

CREATE INDEX IF NOT EXISTS "orders_deleted_at_idx"
  ON "orders"("deleted_at");

CREATE INDEX IF NOT EXISTS "order_items_order_id_idx"
  ON "order_items"("order_id");

CREATE INDEX IF NOT EXISTS "order_items_product_id_idx"
  ON "order_items"("product_id");
