DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeStatus') THEN
    CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive', 'dismissed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeRole') THEN
    CREATE TYPE "EmployeeRole" AS ENUM ('admin', 'gerente', 'funcionario', 'estoque', 'caixa');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "employees" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "job_title" TEXT NOT NULL,
  "employee_role" "EmployeeRole" NOT NULL,
  "birth_date" TIMESTAMP(3),
  "admission_date" TIMESTAMP(3),
  "dismissal_date" TIMESTAMP(3),
  "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "employees_profile_id_key"
  ON "employees"("profile_id");

CREATE UNIQUE INDEX IF NOT EXISTS "employees_email_key"
  ON "employees"("email");

CREATE INDEX IF NOT EXISTS "employees_tenant_id_branch_id_idx"
  ON "employees"("tenant_id", "branch_id");

CREATE INDEX IF NOT EXISTS "employees_tenant_id_branch_id_status_idx"
  ON "employees"("tenant_id", "branch_id", "status");

CREATE INDEX IF NOT EXISTS "employees_tenant_id_branch_id_email_idx"
  ON "employees"("tenant_id", "branch_id", "email");

CREATE INDEX IF NOT EXISTS "employees_deleted_at_idx"
  ON "employees"("deleted_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_profile_id_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_profile_id_fkey"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_tenant_id_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_branch_id_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_created_by_id_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_updated_by_id_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_branch_tenant_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_branch_tenant_fkey"
      FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
      ON DELETE NO ACTION NOT VALID;
  END IF;
END $$;
