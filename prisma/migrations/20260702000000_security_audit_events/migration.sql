CREATE TYPE "AuditSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');
CREATE TYPE "AuditContextKind" AS ENUM ('NORMAL', 'DEV_WORKSPACE', 'DEV_SUPPORT', 'SYSTEM');

CREATE TABLE "security_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" TEXT NOT NULL,
  "severity" "AuditSeverity" NOT NULL,
  "actor_profile_id" UUID,
  "actor_role" TEXT,
  "tenant_id" UUID,
  "branch_id" UUID,
  "context_kind" "AuditContextKind" NOT NULL DEFAULT 'NORMAL',
  "target_type" TEXT,
  "target_id" TEXT,
  "action" TEXT NOT NULL,
  "outcome" "AuditOutcome" NOT NULL,
  "reason_code" TEXT,
  "request_id" TEXT,
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "metadata" JSONB,
  "before_state" JSONB,
  "after_state" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_audit_events_tenant_id_created_at_idx" ON "security_audit_events"("tenant_id", "created_at");
CREATE INDEX "security_audit_events_actor_profile_id_created_at_idx" ON "security_audit_events"("actor_profile_id", "created_at");
CREATE INDEX "security_audit_events_event_type_created_at_idx" ON "security_audit_events"("event_type", "created_at");
CREATE INDEX "security_audit_events_target_type_target_id_created_at_idx" ON "security_audit_events"("target_type", "target_id", "created_at");
CREATE INDEX "security_audit_events_outcome_severity_created_at_idx" ON "security_audit_events"("outcome", "severity", "created_at");
CREATE INDEX "security_audit_events_request_id_idx" ON "security_audit_events"("request_id");

ALTER TABLE "security_audit_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "security_audit_events" FROM anon, authenticated;
CREATE POLICY "security_audit_events_service_role_insert"
  ON "security_audit_events" FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "security_audit_events_service_role_select"
  ON "security_audit_events" FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION reject_security_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_events is append-only';
END;
$$;

CREATE TRIGGER "security_audit_events_no_update"
BEFORE UPDATE ON "security_audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_mutation();

CREATE TRIGGER "security_audit_events_no_delete"
BEFORE DELETE ON "security_audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_mutation();
