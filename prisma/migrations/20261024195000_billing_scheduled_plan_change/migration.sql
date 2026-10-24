-- Persist the requested plan until Mercado Pago confirms the remote update.
ALTER TABLE "billing_subscription_operations"
  ADD COLUMN IF NOT EXISTS "target_plan_id" UUID;

DO $$ BEGIN
  ALTER TABLE "billing_subscription_operations"
    ADD CONSTRAINT "billing_subscription_operations_target_plan_id_fkey"
    FOREIGN KEY ("target_plan_id") REFERENCES "plans"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "billing_subscription_operations_target_plan_id_idx"
  ON "billing_subscription_operations" ("target_plan_id");
