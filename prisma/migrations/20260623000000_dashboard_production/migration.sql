ALTER TABLE "sale_items"
  ADD COLUMN IF NOT EXISTS "unit_cost_cents_snapshot" INTEGER,
  ADD COLUMN IF NOT EXISTS "total_cost_cents_snapshot" INTEGER;

CREATE INDEX IF NOT EXISTS "sales_tenant_branch_sold_at_status_idx"
  ON "sales" ("tenant_id", "branch_id", "sold_at", "status");

CREATE INDEX IF NOT EXISTS "sale_items_sale_id_product_id_idx"
  ON "sale_items" ("sale_id", "product_id");

CREATE INDEX IF NOT EXISTS "sale_payments_sale_id_status_idx"
  ON "sale_payments" ("sale_id", "status");

CREATE INDEX IF NOT EXISTS "expenses_tenant_branch_date_status_idx"
  ON "expenses" ("tenant_id", "branch_id", "date", "status");

CREATE INDEX IF NOT EXISTS "agenda_pets_tenant_branch_start_at_status_idx"
  ON "agenda_pets" ("tenantId", "branch_id", "start_at", "status");

CREATE INDEX IF NOT EXISTS "products_tenant_branch_name_idx"
  ON "products" ("tenant_id", "branch_id", "name");
