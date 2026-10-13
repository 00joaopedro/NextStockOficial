CREATE TABLE "registration_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "canonical_email" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "state" "UserProvisioningState" NOT NULL DEFAULT 'CLAIMED',
  "auth_user_id" UUID,
  "tenant_id" UUID,
  "branch_id" UUID,
  "requested_name" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "system_type" "SystemType" NOT NULL,
  "referral_partner_id" UUID,
  "claim_token" UUID,
  "lease_expires_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "last_error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "registration_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_intents_canonical_email_key"
  ON "registration_intents"("canonical_email");
CREATE UNIQUE INDEX "registration_intents_idempotency_key_key"
  ON "registration_intents"("idempotency_key");
CREATE UNIQUE INDEX "registration_intents_auth_user_id_key"
  ON "registration_intents"("auth_user_id");
CREATE INDEX "registration_intents_state_lease_expires_at_idx"
  ON "registration_intents"("state", "lease_expires_at");
CREATE INDEX "registration_intents_canonical_email_idx"
  ON "registration_intents"("canonical_email");
