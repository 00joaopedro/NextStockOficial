DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseType') THEN
    CREATE TYPE "ExpenseType" AS ENUM ('written', 'upload');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseStatus') THEN
    CREATE TYPE "ExpenseStatus" AS ENUM ('draft', 'pending', 'approved', 'paid', 'canceled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseFileType') THEN
    CREATE TYPE "ExpenseFileType" AS ENUM ('image', 'pdf', 'word', 'other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "type" "ExpenseType" NOT NULL,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
  "total_cents" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "employee_name" TEXT NOT NULL,
  "store_name" TEXT NOT NULL,
  "supplier_id" UUID,
  "supplier_name_snapshot" TEXT,
  "notes" TEXT,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "expense_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "expense_id" UUID NOT NULL,
  "product_name" TEXT NOT NULL,
  "units" INTEGER NOT NULL,
  "total_cost_cents" INTEGER NOT NULL,
  "product_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "expense_files" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "expense_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_type" "ExpenseFileType" NOT NULL,
  "file_size" INTEGER NOT NULL,
  "storage_path" TEXT NOT NULL,
  "file_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_branch_id_date_idx"
  ON "expenses"("tenant_id", "branch_id", "date");

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_branch_id_status_idx"
  ON "expenses"("tenant_id", "branch_id", "status");

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_branch_id_type_idx"
  ON "expenses"("tenant_id", "branch_id", "type");

CREATE INDEX IF NOT EXISTS "expenses_tenant_id_branch_id_supplier_id_idx"
  ON "expenses"("tenant_id", "branch_id", "supplier_id");

CREATE INDEX IF NOT EXISTS "expenses_deleted_at_idx"
  ON "expenses"("deleted_at");

CREATE INDEX IF NOT EXISTS "expense_items_expense_id_idx"
  ON "expense_items"("expense_id");

CREATE INDEX IF NOT EXISTS "expense_items_product_id_idx"
  ON "expense_items"("product_id");

CREATE INDEX IF NOT EXISTS "expense_files_expense_id_idx"
  ON "expense_files"("expense_id");

CREATE INDEX IF NOT EXISTS "expense_files_tenant_id_branch_id_idx"
  ON "expense_files"("tenant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "expense_files_deleted_at_idx"
  ON "expense_files"("deleted_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_tenant_id_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_branch_id_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_supplier_id_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_supplier_id_fkey"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_created_by_id_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_updated_by_id_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_items_expense_id_fkey') THEN
    ALTER TABLE "expense_items"
      ADD CONSTRAINT "expense_items_expense_id_fkey"
      FOREIGN KEY ("expense_id") REFERENCES "expenses"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_items_product_id_fkey') THEN
    ALTER TABLE "expense_items"
      ADD CONSTRAINT "expense_items_product_id_fkey"
      FOREIGN KEY ("product_id") REFERENCES "products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_files_expense_id_fkey') THEN
    ALTER TABLE "expense_files"
      ADD CONSTRAINT "expense_files_expense_id_fkey"
      FOREIGN KEY ("expense_id") REFERENCES "expenses"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_files_tenant_id_fkey') THEN
    ALTER TABLE "expense_files"
      ADD CONSTRAINT "expense_files_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_files_branch_id_fkey') THEN
    ALTER TABLE "expense_files"
      ADD CONSTRAINT "expense_files_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_branch_tenant_fkey') THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_files_branch_tenant_fkey') THEN
    ALTER TABLE "expense_files"
      ADD CONSTRAINT "expense_files_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
