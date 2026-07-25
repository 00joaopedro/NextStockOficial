-- RC-002: persistent ownership token for fiscal provider dispatches.
CREATE TYPE "FiscalSendAttemptState" AS ENUM (
  'claimed',
  'dispatching',
  'unknown',
  'completed',
  'failed_pre_network'
);

ALTER TABLE "sale_documents"
  ADD COLUMN "send_attempt_id" UUID,
  ADD COLUMN "send_attempt_state" "FiscalSendAttemptState",
  ADD COLUMN "processing_started_at" TIMESTAMP(3);

ALTER TABLE "fiscal_document_events"
  ADD COLUMN "attempt_id" UUID;

CREATE INDEX "sale_documents_tenant_id_branch_id_id_send_attempt_id_idx"
  ON "sale_documents"("tenant_id", "branch_id", "id", "send_attempt_id");
CREATE INDEX "fiscal_document_events_document_id_attempt_id_idx"
  ON "fiscal_document_events"("document_id", "attempt_id");
