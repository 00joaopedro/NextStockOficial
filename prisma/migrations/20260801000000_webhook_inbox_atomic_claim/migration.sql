-- RC-010: durable identity, leased ownership and fencing for billing webhooks.
ALTER TYPE "GatewayWebhookProcessingStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "GatewayWebhookProcessingStatus" ADD VALUE IF NOT EXISTS 'FAILED_RETRYABLE';
ALTER TYPE "GatewayWebhookProcessingStatus" ADD VALUE IF NOT EXISTS 'FAILED_FINAL';

ALTER TABLE "gateway_webhook_events"
  ADD COLUMN "identity_key" TEXT,
  ADD COLUMN "account_scope" TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN "claim_token" UUID,
  ADD COLUMN "claimed_at" TIMESTAMP(3),
  ADD COLUMN "lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "failure_code" TEXT;

-- Existing rows retain their original provider/event identity. Payload-only
-- legacy rows cannot safely be retroactively canonicalized from sanitized JSON.
UPDATE "gateway_webhook_events"
SET "account_scope" = encode(digest('platform', 'sha256'), 'hex');

UPDATE "gateway_webhook_events"
SET "identity_key" = encode(digest(
  "provider"::text || E'\n' || "account_scope" || E'\nid\n' || "gateway_event_id",
  'sha256'
), 'hex')
WHERE "gateway_event_id" IS NOT NULL;

CREATE UNIQUE INDEX "gateway_webhook_events_identity_key_key"
  ON "gateway_webhook_events"("identity_key");
DROP INDEX IF EXISTS "gateway_webhook_events_status_created_idx";
CREATE INDEX "gateway_webhook_events_status_lease_idx"
  ON "gateway_webhook_events"("processing_status", "lease_expires_at");
