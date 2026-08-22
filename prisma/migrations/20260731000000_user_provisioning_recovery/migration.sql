CREATE TYPE "UserProvisioningState" AS ENUM (
  'CLAIMED', 'AUTH_CREATED', 'PROFILE_CREATED', 'COMPLETED',
  'COMPENSATION_REQUIRED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'UNKNOWN'
);

CREATE TABLE "user_provisionings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "canonical_email" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "state" "UserProvisioningState" NOT NULL DEFAULT 'CLAIMED',
  "auth_user_id" UUID,
  "profile_id" UUID,
  "membership_id" UUID,
  "claim_token" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "last_error_code" TEXT,
  "compensation_state" TEXT,
  "actor_profile_id" UUID NOT NULL,
  "requested_name" TEXT NOT NULL,
  "requested_role" "Role" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "user_provisionings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_provisionings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "user_provisionings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "user_provisionings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "user_provisionings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tenant_members"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "user_provisionings_canonical_email_key" ON "user_provisionings"("canonical_email");
CREATE UNIQUE INDEX "user_provisionings_idempotency_key_key" ON "user_provisionings"("idempotency_key");
CREATE UNIQUE INDEX "user_provisionings_auth_user_id_key" ON "user_provisionings"("auth_user_id");
CREATE UNIQUE INDEX "user_provisionings_profile_id_key" ON "user_provisionings"("profile_id");
CREATE UNIQUE INDEX "user_provisionings_membership_id_key" ON "user_provisionings"("membership_id");
CREATE INDEX "user_provisionings_state_lease_expires_at_idx" ON "user_provisionings"("state", "lease_expires_at");
CREATE INDEX "user_provisionings_tenant_id_branch_id_idx" ON "user_provisionings"("tenant_id", "branch_id");

CREATE TABLE "user_provisioning_events" (
  "id" BIGSERIAL NOT NULL,
  "provisioning_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "decision" TEXT NOT NULL,
  "from_state" "UserProvisioningState",
  "to_state" "UserProvisioningState" NOT NULL,
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_provisioning_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_provisioning_events_provisioning_id_fkey" FOREIGN KEY ("provisioning_id") REFERENCES "user_provisionings"("id") ON DELETE RESTRICT
);
CREATE INDEX "user_provisioning_events_provisioning_id_created_at_idx" ON "user_provisioning_events"("provisioning_id", "created_at");
CREATE INDEX "user_provisioning_events_tenant_id_branch_id_created_at_idx" ON "user_provisioning_events"("tenant_id", "branch_id", "created_at");
