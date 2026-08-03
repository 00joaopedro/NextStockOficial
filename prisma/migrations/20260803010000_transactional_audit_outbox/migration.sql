CREATE TYPE "AuditOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_FINAL');

CREATE TABLE "audit_outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tenant_id" UUID NOT NULL,
  "branch_id" UUID, "actor_profile_id" UUID, "actor_role" TEXT,
  "request_id" TEXT, "operation_id" TEXT NOT NULL, "payload_hash" TEXT NOT NULL,
  "event_type" TEXT NOT NULL, "action" TEXT NOT NULL, "outcome" "AuditOutcome" NOT NULL,
  "severity" "AuditSeverity" NOT NULL, "context_kind" "AuditContextKind" NOT NULL DEFAULT 'NORMAL',
  "target_type" TEXT, "target_id" TEXT, "reason_code" TEXT, "ip_hash" TEXT,
  "user_agent_hash" TEXT, "metadata" JSONB, "before_state" JSONB, "after_state" JSONB,
  "status" "AuditOutboxStatus" NOT NULL DEFAULT 'PENDING', "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "claim_token" UUID, "claimed_at" TIMESTAMP(3), "lease_expires_at" TIMESTAMP(3),
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "delivered_at" TIMESTAMP(3),
  "last_error_code" TEXT, "last_error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_outbox_events_tenant_operation_key" UNIQUE ("tenant_id", "operation_id"),
  CONSTRAINT "audit_outbox_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "audit_outbox_events_branch_tenant_fk" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "audit_outbox_events_actor_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL
);
CREATE INDEX "audit_outbox_events_status_available_at_idx" ON "audit_outbox_events"("status", "available_at");
CREATE INDEX "audit_outbox_events_status_lease_expires_at_idx" ON "audit_outbox_events"("status", "lease_expires_at");
CREATE INDEX "audit_outbox_events_tenant_branch_created_at_idx" ON "audit_outbox_events"("tenant_id", "branch_id", "created_at");

ALTER TABLE "security_audit_events" ADD COLUMN "outbox_event_id" UUID;
CREATE UNIQUE INDEX "security_audit_events_outbox_event_id_key" ON "security_audit_events"("outbox_event_id");
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_outbox_event_fk"
  FOREIGN KEY ("outbox_event_id") REFERENCES "audit_outbox_events"("id") ON DELETE RESTRICT;

ALTER TABLE "audit_outbox_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "audit_outbox_events" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE "audit_outbox_events" TO service_role;
CREATE POLICY "audit_outbox_events_service_role" ON "audit_outbox_events" FOR ALL TO service_role USING (true) WITH CHECK (true);
