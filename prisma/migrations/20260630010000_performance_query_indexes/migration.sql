-- Additive indexes matching the final tenant/branch filters and sort order.
-- Existing indexes are intentionally preserved for rollback safety.

CREATE INDEX IF NOT EXISTS "subscriptions_tenant_id_updated_at_idx"
  ON "subscriptions"("tenant_id", "updated_at");

CREATE INDEX IF NOT EXISTS "agenda_pets_tenantId_branch_id_deleted_at_start_at_idx"
  ON "agenda_pets"("tenantId", "branch_id", "deleted_at", "start_at");

CREATE INDEX IF NOT EXISTS "pets_tenant_id_branch_id_client_id_deleted_at_created_at_idx"
  ON "pets"("tenant_id", "branch_id", "client_id", "deleted_at", "created_at");

CREATE INDEX IF NOT EXISTS "pet_photos_tenant_id_branch_id_pet_id_created_at_idx"
  ON "pet_photos"("tenant_id", "branch_id", "pet_id", "created_at");

CREATE INDEX IF NOT EXISTS "products_tenant_id_branch_id_created_at_idx"
  ON "products"("tenant_id", "branch_id", "created_at");

CREATE INDEX IF NOT EXISTS "orders_tenant_id_branch_id_status_deleted_at_created_at_idx"
  ON "orders"("tenant_id", "branch_id", "status", "deleted_at", "created_at");

CREATE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_status_deleted_at_sold_at_idx"
  ON "sales"("tenant_id", "branch_id", "status", "deleted_at", "sold_at");

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_branch_id_status_deleted_at_date_idx"
  ON "expenses"("tenant_id", "branch_id", "status", "deleted_at", "date");

CREATE INDEX IF NOT EXISTS "expense_files_expense_id_deleted_at_created_at_idx"
  ON "expense_files"("expense_id", "deleted_at", "created_at");
