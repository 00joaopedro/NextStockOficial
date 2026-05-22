CREATE TABLE IF NOT EXISTS "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "cost_price_cents" INTEGER NOT NULL,
  "profit_percent" DECIMAL(7,2) NOT NULL,
  "sale_price_cents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "brand" TEXT,
  "category" TEXT,
  "supplier" TEXT,
  "sku" TEXT,
  "barcode" TEXT,
  "description" TEXT,
  "weight" TEXT,
  "height" TEXT,
  "width" TEXT,
  "external_link" TEXT,
  "clothing_size" TEXT,
  "apparel_size" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "product_images" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_url" TEXT,
  "storage_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_sku_key"
  ON "products"("tenant_id", "sku");

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id_barcode_key"
  ON "products"("tenant_id", "barcode");

CREATE INDEX IF NOT EXISTS "products_tenant_id_idx"
  ON "products"("tenant_id");

CREATE INDEX IF NOT EXISTS "products_tenant_id_category_idx"
  ON "products"("tenant_id", "category");

CREATE INDEX IF NOT EXISTS "product_images_product_id_idx"
  ON "product_images"("product_id");

ALTER TABLE "products"
  ADD CONSTRAINT "products_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_images"
  ADD CONSTRAINT "product_images_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
