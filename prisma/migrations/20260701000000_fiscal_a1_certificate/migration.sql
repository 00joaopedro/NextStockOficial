DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CertificateValidationStatus') THEN
    CREATE TYPE "CertificateValidationStatus" AS ENUM (
      'pending',
      'valid',
      'invalid',
      'expired',
      'cnpj_mismatch',
      'decrypt_error'
    );
  END IF;
END $$;

ALTER TABLE "company_fiscal_configs"
  ADD COLUMN IF NOT EXISTS "certificate_original_name" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_mime_type" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_size" INTEGER,
  ADD COLUMN IF NOT EXISTS "certificate_password_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_password_key_version" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_uploaded_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "certificate_valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "certificate_subject" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_issuer" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_serial_number" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_cnpj" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_fingerprint_sha256" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_validated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "certificate_validation_status" "CertificateValidationStatus",
  ADD COLUMN IF NOT EXISTS "certificate_validation_error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "production_enabled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "production_enabled_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_fiscal_configs_certificate_size_check'
  ) THEN
    ALTER TABLE "company_fiscal_configs"
      ADD CONSTRAINT "company_fiscal_configs_certificate_size_check"
      CHECK ("certificate_size" IS NULL OR "certificate_size" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_fiscal_configs_production_enabled_by_id_fkey'
  ) THEN
    ALTER TABLE "company_fiscal_configs"
      ADD CONSTRAINT "company_fiscal_configs_production_enabled_by_id_fkey"
      FOREIGN KEY ("production_enabled_by_id")
      REFERENCES "profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "company_fiscal_configs_certificate_expires_at_idx"
  ON "company_fiscal_configs"("certificate_expires_at");
CREATE INDEX IF NOT EXISTS "company_fiscal_configs_certificate_fingerprint_sha256_idx"
  ON "company_fiscal_configs"("certificate_fingerprint_sha256");
CREATE INDEX IF NOT EXISTS "company_fiscal_configs_production_enabled_by_id_idx"
  ON "company_fiscal_configs"("production_enabled_by_id");
