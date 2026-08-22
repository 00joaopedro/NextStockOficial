-- Additive foundation for one opt-in public storefront per branch.
CREATE TYPE "StorefrontStatus" AS ENUM ('draft', 'active', 'paused', 'suspended', 'archived');
CREATE TYPE "OrderSource" AS ENUM ('admin', 'storefront_guest');
CREATE TYPE "FulfillmentType" AS ENUM ('pickup', 'delivery');

CREATE UNIQUE INDEX IF NOT EXISTS "branches_id_tenant_id_key" ON "branches"("id", "tenant_id");

CREATE TABLE "storefronts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "public_slug" TEXT NOT NULL,
  "status" "StorefrontStatus" NOT NULL DEFAULT 'draft',
  "public_name" TEXT NOT NULL,
  "public_description" TEXT,
  "ordering_enabled" BOOLEAN NOT NULL DEFAULT false,
  "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
  "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storefronts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefronts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "storefronts_branch_id_tenant_id_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "storefronts_branch_id_key" ON "storefronts"("branch_id");
CREATE UNIQUE INDEX "storefronts_public_slug_key" ON "storefronts"("public_slug");
CREATE UNIQUE INDEX "storefronts_branch_id_tenant_id_key" ON "storefronts"("branch_id", "tenant_id");
CREATE INDEX "storefronts_tenant_id_status_idx" ON "storefronts"("tenant_id", "status");

CREATE TABLE "storefront_products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storefront_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "public_slug" TEXT NOT NULL,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "available_for_online_order" BOOLEAN NOT NULL DEFAULT false,
  "public_name" TEXT,
  "public_description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "minimum_order_quantity" INTEGER NOT NULL DEFAULT 1,
  "maximum_order_quantity" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storefront_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_products_storefront_id_fkey" FOREIGN KEY ("storefront_id") REFERENCES "storefronts"("id") ON DELETE CASCADE,
  CONSTRAINT "storefront_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "storefront_products_quantity_check" CHECK ("minimum_order_quantity" >= 1 AND ("maximum_order_quantity" IS NULL OR "maximum_order_quantity" >= "minimum_order_quantity"))
);
CREATE UNIQUE INDEX "storefront_products_storefront_id_product_id_key" ON "storefront_products"("storefront_id", "product_id");
CREATE UNIQUE INDEX "storefront_products_storefront_id_public_slug_key" ON "storefront_products"("storefront_id", "public_slug");
CREATE INDEX "storefront_products_storefront_id_is_published_sort_order_idx" ON "storefront_products"("storefront_id", "is_published", "sort_order");
CREATE INDEX "storefront_products_product_id_idx" ON "storefront_products"("product_id");

CREATE TABLE "storefront_slug_redirects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storefront_id" UUID NOT NULL,
  "old_slug" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storefront_slug_redirects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storefront_slug_redirects_storefront_id_fkey" FOREIGN KEY ("storefront_id") REFERENCES "storefronts"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "storefront_slug_redirects_old_slug_key" ON "storefront_slug_redirects"("old_slug");
CREATE INDEX "storefront_slug_redirects_storefront_id_idx" ON "storefront_slug_redirects"("storefront_id");

ALTER TABLE "orders"
  ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'admin',
  ADD COLUMN "storefront_id" UUID,
  ADD COLUMN "public_reference" TEXT,
  ADD COLUMN "public_access_token_hash" TEXT,
  ADD COLUMN "idempotency_key_hash" TEXT,
  ADD COLUMN "idempotency_request_hash" TEXT,
  ADD COLUMN "fulfillment_type" "FulfillmentType",
  ADD COLUMN "delivery_address" JSONB,
  ADD COLUMN "reservation_expires_at" TIMESTAMP(3),
  ADD COLUMN "stock_restored_at" TIMESTAMP(3),
  ADD CONSTRAINT "orders_storefront_id_fkey" FOREIGN KEY ("storefront_id") REFERENCES "storefronts"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX "orders_public_reference_key" ON "orders"("public_reference");
CREATE UNIQUE INDEX "orders_storefront_id_idempotency_key_hash_key" ON "orders"("storefront_id", "idempotency_key_hash");
CREATE INDEX "orders_storefront_id_status_created_at_idx" ON "orders"("storefront_id", "status", "created_at");
CREATE INDEX "orders_source_reservation_expires_at_stock_restored_at_idx" ON "orders"("source", "reservation_expires_at", "stock_restored_at");

ALTER TABLE "storefronts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_slug_redirects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "storefronts", "storefront_products", "storefront_slug_redirects" FROM anon, authenticated;
CREATE POLICY "storefronts_service_role_all" ON "storefronts" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "storefront_products_service_role_all" ON "storefront_products" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "storefront_slug_redirects_service_role_all" ON "storefront_slug_redirects" FOR ALL TO service_role USING (true) WITH CHECK (true);
