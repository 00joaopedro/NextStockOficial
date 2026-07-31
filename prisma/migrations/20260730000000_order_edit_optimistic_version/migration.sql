-- RC-006: optimistic revision used by the scoped order-edit compare-and-swap.
-- DEFAULT 1 safely backfills existing rows and initializes new orders.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_version_positive_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_version_positive_check" CHECK ("version" > 0);
  END IF;
END $$;
