ALTER TABLE "company_fiscal_configs"
  ADD COLUMN IF NOT EXISTS "receipt_paper_width_mm" INTEGER NOT NULL DEFAULT 80;

ALTER TABLE "company_fiscal_configs"
  ADD CONSTRAINT "company_fiscal_configs_receipt_paper_width_mm_check"
  CHECK ("receipt_paper_width_mm" IN (58, 80));
