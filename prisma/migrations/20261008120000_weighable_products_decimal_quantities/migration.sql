-- Preserve legacy integer stock and sale history while enabling fractional quantities.
ALTER TABLE "products"
  ADD COLUMN "quantity_decimal" DECIMAL(12, 6),
  ADD COLUMN "is_weighable" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "order_items"
  ADD COLUMN "quantity_decimal" DECIMAL(12, 6);

ALTER TABLE "sale_items"
  ADD COLUMN "quantity_decimal" DECIMAL(12, 6),
  ADD COLUMN "is_weighable_snapshot" BOOLEAN NOT NULL DEFAULT false;

UPDATE "products"
SET "quantity_decimal" = "quantity"::DECIMAL(12, 6)
WHERE "quantity_decimal" IS NULL;

UPDATE "order_items"
SET "quantity_decimal" = "quantity"::DECIMAL(12, 6)
WHERE "quantity_decimal" IS NULL;

UPDATE "sale_items"
SET "quantity_decimal" = "quantity"::DECIMAL(12, 6)
WHERE "quantity_decimal" IS NULL;
