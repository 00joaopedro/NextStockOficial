DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiscalEnvironment') THEN
    CREATE TYPE "FiscalEnvironment" AS ENUM ('homologacao', 'producao');
  END IF;
END
$$;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "ncm" TEXT,
  ADD COLUMN IF NOT EXISTS "cfop_default" TEXT,
  ADD COLUMN IF NOT EXISTS "cest" TEXT,
  ADD COLUMN IF NOT EXISTS "origin" TEXT,
  ADD COLUMN IF NOT EXISTS "unit" TEXT,
  ADD COLUMN IF NOT EXISTS "icms_rate" DECIMAL(7,4),
  ADD COLUMN IF NOT EXISTS "ipi_rate" DECIMAL(7,4),
  ADD COLUMN IF NOT EXISTS "pis_rate" DECIMAL(7,4),
  ADD COLUMN IF NOT EXISTS "cofins_rate" DECIMAL(7,4);

ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "ncm_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "cfop_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "origin_snapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "cest_snapshot" TEXT;

ALTER TABLE "sale_documents"
  ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
  ADD COLUMN IF NOT EXISTS "branch_id" UUID,
  ADD COLUMN IF NOT EXISTS "order_id" UUID,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "environment" "FiscalEnvironment",
  ADD COLUMN IF NOT EXISTS "protocol" TEXT,
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_ref" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "normalized_payload" JSONB,
  ADD COLUMN IF NOT EXISTS "provider_response" JSONB,
  ADD COLUMN IF NOT EXISTS "error_message" TEXT,
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "company_fiscal_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "legal_name" TEXT NOT NULL,
  "trade_name" TEXT,
  "cnpj" TEXT NOT NULL,
  "state_registration" TEXT,
  "municipal_registration" TEXT,
  "crt" INTEGER NOT NULL,
  "tax_regime" TEXT NOT NULL,
  "street" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "complement" TEXT,
  "district" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "city_code_ibge" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "zip_code" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'Brasil',
  "environment" "FiscalEnvironment" NOT NULL DEFAULT 'homologacao',
  "certificate_path" TEXT,
  "certificate_secret_ref" TEXT,
  "certificate_expires_at" TIMESTAMP(3),
  "nfe_series" TEXT NOT NULL DEFAULT '1',
  "nfce_series" TEXT NOT NULL DEFAULT '1',
  "next_nfe_number" INTEGER NOT NULL DEFAULT 1,
  "next_nfce_number" INTEGER NOT NULL DEFAULT 1,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "provider_config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_fiscal_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_fiscal_configs_numbers_check"
    CHECK ("next_nfe_number" > 0 AND "next_nfce_number" > 0)
);

CREATE TABLE IF NOT EXISTS "fiscal_document_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "sale_item_id" UUID,
  "product_id" UUID,
  "description" TEXT NOT NULL,
  "sku" TEXT,
  "barcode" TEXT,
  "ncm" TEXT NOT NULL,
  "cfop" TEXT NOT NULL,
  "cest" TEXT,
  "origin" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "total_price_cents" INTEGER NOT NULL,
  "discount_cents" INTEGER NOT NULL DEFAULT 0,
  "icms_code" TEXT,
  "icms_rate" DECIMAL(7,4),
  "icms_amount_cents" INTEGER,
  "ipi_code" TEXT,
  "ipi_rate" DECIMAL(7,4),
  "ipi_amount_cents" INTEGER,
  "pis_code" TEXT,
  "pis_rate" DECIMAL(7,4),
  "pis_amount_cents" INTEGER,
  "cofins_code" TEXT,
  "cofins_rate" DECIMAL(7,4),
  "cofins_amount_cents" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_document_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_document_items_values_check" CHECK (
    "quantity" > 0
    AND "unit_price_cents" >= 0
    AND "total_price_cents" >= 0
    AND "discount_cents" >= 0
  )
);

CREATE TABLE IF NOT EXISTS "fiscal_document_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" "SaleDocumentStatus" NOT NULL,
  "provider_ref" TEXT,
  "request_payload" JSONB,
  "response_payload" JSONB,
  "error_message" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_document_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fiscal_sequences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "model" TEXT NOT NULL,
  "series" TEXT NOT NULL,
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "environment" "FiscalEnvironment" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_sequences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_sequences_next_number_check" CHECK ("next_number" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_fiscal_configs_tenant_id_branch_id_key"
  ON "company_fiscal_configs"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "company_fiscal_configs_cnpj_idx"
  ON "company_fiscal_configs"("cnpj");
CREATE INDEX IF NOT EXISTS "fiscal_document_items_document_id_idx"
  ON "fiscal_document_items"("document_id");
CREATE INDEX IF NOT EXISTS "fiscal_document_items_sale_item_id_idx"
  ON "fiscal_document_items"("sale_item_id");
CREATE INDEX IF NOT EXISTS "fiscal_document_items_product_id_idx"
  ON "fiscal_document_items"("product_id");
CREATE INDEX IF NOT EXISTS "fiscal_document_events_document_id_created_at_idx"
  ON "fiscal_document_events"("document_id", "created_at");
CREATE INDEX IF NOT EXISTS "fiscal_document_events_provider_ref_idx"
  ON "fiscal_document_events"("provider_ref");
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_sequences_scope_key"
  ON "fiscal_sequences"("tenant_id", "branch_id", "model", "series", "environment");
CREATE INDEX IF NOT EXISTS "fiscal_sequences_tenant_id_branch_id_idx"
  ON "fiscal_sequences"("tenant_id", "branch_id");
CREATE INDEX IF NOT EXISTS "sale_documents_tenant_id_branch_id_status_type_idx"
  ON "sale_documents"("tenant_id", "branch_id", "status", "type");
CREATE INDEX IF NOT EXISTS "sale_documents_order_id_idx"
  ON "sale_documents"("order_id");
CREATE INDEX IF NOT EXISTS "sale_documents_idempotency_key_idx"
  ON "sale_documents"("idempotency_key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "sale_documents"
    WHERE "provider_ref" IS NOT NULL
    GROUP BY "provider_ref" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "sale_documents_provider_ref_key"
      ON "sale_documents"("provider_ref") WHERE "provider_ref" IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped provider_ref unique index because duplicate legacy values exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "sale_documents"
    WHERE "access_key" IS NOT NULL
    GROUP BY "access_key" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "sale_documents_access_key_key"
      ON "sale_documents"("access_key") WHERE "access_key" IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped access_key unique index because duplicate legacy values exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "sale_documents"
    WHERE "idempotency_key" IS NOT NULL
    GROUP BY "idempotency_key" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "sale_documents_idempotency_key_key"
      ON "sale_documents"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "sale_documents"
    WHERE "number" IS NOT NULL
      AND "tenant_id" IS NOT NULL
      AND "branch_id" IS NOT NULL
      AND "model" IS NOT NULL
    GROUP BY "tenant_id", "branch_id", "model", "series", "number"
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "sale_documents_fiscal_number_key"
      ON "sale_documents"("tenant_id", "branch_id", "model", "series", "number")
      WHERE "number" IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped fiscal number unique index because duplicate legacy values exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "sale_documents"
    WHERE "type" IN ('nfe55', 'nfce65')
      AND "status" <> 'canceled'
      AND "deleted_at" IS NULL
    GROUP BY "sale_id", "type"
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "sale_documents_active_sale_type_key"
      ON "sale_documents"("sale_id", "type")
      WHERE "type" IN ('nfe55', 'nfce65')
        AND "status" <> 'canceled'
        AND "deleted_at" IS NULL;
  ELSE
    RAISE NOTICE 'Skipped active fiscal document unique index because duplicate legacy documents exist.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_tenant_id_fkey') THEN
    ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_branch_id_fkey') THEN
    ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_order_id_fkey') THEN
    ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_created_by_id_fkey') THEN
    ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_documents_updated_by_id_fkey') THEN
    ALTER TABLE "sale_documents" ADD CONSTRAINT "sale_documents_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_configs_tenant_id_fkey') THEN
    ALTER TABLE "company_fiscal_configs" ADD CONSTRAINT "company_fiscal_configs_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_configs_branch_id_fkey') THEN
    ALTER TABLE "company_fiscal_configs" ADD CONSTRAINT "company_fiscal_configs_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_document_items_document_id_fkey') THEN
    ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "sale_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_document_items_sale_item_id_fkey') THEN
    ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_sale_item_id_fkey"
      FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_document_items_product_id_fkey') THEN
    ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_document_events_document_id_fkey') THEN
    ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_document_id_fkey"
      FOREIGN KEY ("document_id") REFERENCES "sale_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_document_events_created_by_id_fkey') THEN
    ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_sequences_tenant_id_fkey') THEN
    ALTER TABLE "fiscal_sequences" ADD CONSTRAINT "fiscal_sequences_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_sequences_branch_id_fkey') THEN
    ALTER TABLE "fiscal_sequences" ADD CONSTRAINT "fiscal_sequences_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "company_fiscal_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_document_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_document_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_sequences" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'company_fiscal_configs',
    'fiscal_document_items',
    'fiscal_document_events',
    'fiscal_sequences'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
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
