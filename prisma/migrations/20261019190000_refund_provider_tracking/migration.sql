ALTER TABLE "billing_refund_intents"
  ADD COLUMN IF NOT EXISTS "gateway_refund_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_refund_status" TEXT;
