-- Add complete fiscal classification for products and fiscal document snapshots.
ALTER TABLE "products"
  ADD COLUMN "taxable_unit" TEXT,
  ADD COLUMN "icms_cst" TEXT,
  ADD COLUMN "icms_csosn" TEXT,
  ADD COLUMN "ipi_code" TEXT,
  ADD COLUMN "pis_code" TEXT,
  ADD COLUMN "cofins_code" TEXT;

ALTER TABLE "sale_items"
  ADD COLUMN "taxable_unit_snapshot" TEXT,
  ADD COLUMN "icms_cst_snapshot" TEXT,
  ADD COLUMN "icms_csosn_snapshot" TEXT,
  ADD COLUMN "ipi_code_snapshot" TEXT,
  ADD COLUMN "pis_code_snapshot" TEXT,
  ADD COLUMN "cofins_code_snapshot" TEXT;

ALTER TABLE "fiscal_document_items"
  ADD COLUMN "taxable_unit" TEXT,
  ADD COLUMN "quantity_decimal" DECIMAL(12, 6),
  ADD COLUMN "icms_cst" TEXT,
  ADD COLUMN "icms_csosn" TEXT,
  ADD COLUMN "ipi_code" TEXT,
  ADD COLUMN "pis_code" TEXT,
  ADD COLUMN "cofins_code" TEXT;
