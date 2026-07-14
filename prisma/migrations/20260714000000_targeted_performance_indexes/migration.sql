-- Targeted additive indexes for high-traffic list endpoints on Railway Hobby + Supabase Free.
-- They match the tenant/branch/deletedAt filters and default sort orders used by Prisma services.

CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_branch_id_deleted_at_created_at_idx"
  ON "pet_clients"("tenant_id", "branch_id", "deleted_at", "created_at");

CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_branch_id_deleted_at_name_idx"
  ON "pet_clients"("tenant_id", "branch_id", "deleted_at", "name");

CREATE INDEX IF NOT EXISTS "pet_clients_tenant_id_branch_id_deleted_at_phone_idx"
  ON "pet_clients"("tenant_id", "branch_id", "deleted_at", "phone");

CREATE INDEX IF NOT EXISTS "orders_tenant_id_branch_id_deleted_at_created_at_idx"
  ON "orders"("tenant_id", "branch_id", "deleted_at", "created_at");

CREATE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_deleted_at_sold_at_idx"
  ON "sales"("tenant_id", "branch_id", "deleted_at", "sold_at");

CREATE INDEX IF NOT EXISTS "sales_tenant_id_branch_id_document_type_deleted_at_sold_at_idx"
  ON "sales"("tenant_id", "branch_id", "document_type", "deleted_at", "sold_at");

CREATE INDEX IF NOT EXISTS "sale_documents_tenant_id_branch_id_type_status_created_at_idx"
  ON "sale_documents"("tenant_id", "branch_id", "type", "status", "created_at");

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_branch_id_deleted_at_date_idx"
  ON "expenses"("tenant_id", "branch_id", "deleted_at", "date");
