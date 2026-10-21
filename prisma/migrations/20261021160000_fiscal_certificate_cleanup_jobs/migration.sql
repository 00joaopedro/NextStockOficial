-- Retry queue for private fiscal certificate objects that could not be removed.
CREATE TYPE "FiscalCertificateCleanupStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_FINAL');

CREATE TABLE "fiscal_certificate_cleanup_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "storage_path" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "FiscalCertificateCleanupStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMPTZ,
  "last_error_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_certificate_cleanup_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_certificate_cleanup_jobs_tenant_id_storage_path_key"
  ON "fiscal_certificate_cleanup_jobs"("tenant_id", "storage_path");
CREATE INDEX "fiscal_certificate_cleanup_jobs_status_available_at_idx"
  ON "fiscal_certificate_cleanup_jobs"("status", "available_at");

ALTER TABLE "fiscal_certificate_cleanup_jobs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "fiscal_certificate_cleanup_jobs" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE "fiscal_certificate_cleanup_jobs" TO service_role;
CREATE POLICY "fiscal_certificate_cleanup_jobs_service_role"
  ON "fiscal_certificate_cleanup_jobs"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
