DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FiscalActivationStatus') THEN
    CREATE TYPE "FiscalActivationStatus" AS ENUM (
      'pendente',
      'homologacao',
      'ativo',
      'suspenso'
    );
  END IF;
END
$$;

ALTER TABLE "company_fiscal_configs"
  ADD COLUMN IF NOT EXISTS "activation_status" "FiscalActivationStatus"
  NOT NULL DEFAULT 'pendente';

UPDATE "company_fiscal_configs"
SET "activation_status" = CASE
  WHEN "environment" = 'producao'
    AND "certificate_validation_status" = 'valid'
    THEN 'ativo'::"FiscalActivationStatus"
  WHEN "certificate_validation_status" = 'valid'
    THEN 'homologacao'::"FiscalActivationStatus"
  ELSE 'pendente'::"FiscalActivationStatus"
END
WHERE "activation_status" = 'pendente'::"FiscalActivationStatus";
