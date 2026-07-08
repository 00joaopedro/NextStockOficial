UPDATE "sale_documents"
SET "status" = 'internal_issued'
WHERE "type" = 'receipt'
  AND "status" = 'authorized';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_documents_internal_receipt_non_fiscal_check'
  ) THEN
    ALTER TABLE "sale_documents"
      ADD CONSTRAINT "sale_documents_internal_receipt_non_fiscal_check"
      CHECK (
        "type" <> 'receipt'
        OR (
          "status" IN ('internal_issued', 'canceled')
          AND "model" IS NULL
          AND "environment" IS NULL
          AND "number" IS NULL
          AND "series" IS NULL
          AND "access_key" IS NULL
          AND "protocol" IS NULL
          AND "provider" IS NULL
          AND "provider_ref" IS NULL
          AND "xml_path" IS NULL
          AND "pdf_path" IS NULL
        )
      ) NOT VALID;
  END IF;
END $$;
