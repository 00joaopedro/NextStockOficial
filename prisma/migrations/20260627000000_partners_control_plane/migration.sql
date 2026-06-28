-- NextStock control-plane partners and referral attribution.
-- Additive only: no legacy/localStorage data is imported.

CREATE TYPE "PartnerLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');
CREATE TYPE "PartnerReferralStatus" AS ENUM ('REGISTERED', 'TRIALING', 'CONVERTED', 'CANCELED', 'REJECTED');
CREATE TYPE "PartnerPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED', 'CANCELED');
CREATE TYPE "PartnerPaymentSource" AS ENUM ('MANUAL', 'MERCADO_PAGO', 'SUBSCRIPTION_SYNC', 'MIGRATION');
CREATE TYPE "PartnerLinkEventType" AS ENUM ('GENERATED', 'ACTIVATED', 'DEACTIVATED', 'ROTATED', 'USED', 'REJECTED', 'DELETED');

CREATE TABLE "partners" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "bank_number" TEXT NOT NULL,
  "referral_code" TEXT NOT NULL,
  "referral_code_hash" TEXT NOT NULL,
  "referral_code_prefix" TEXT NOT NULL,
  "link_status" "PartnerLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "system_type" "SystemType" NOT NULL,
  "expires_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_by_id" UUID NOT NULL,
  "updated_by_id" UUID,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_referrals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL,
  "referred_profile_id" UUID NOT NULL,
  "referred_tenant_id" UUID NOT NULL,
  "referred_branch_id" UUID NOT NULL,
  "system_type" "SystemType" NOT NULL,
  "status" "PartnerReferralStatus" NOT NULL DEFAULT 'REGISTERED',
  "payment_status" "PartnerPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "seen_at" TIMESTAMP(3),
  "seen_by_id" UUID,
  "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "converted_at" TIMESTAMP(3),
  "attribution_metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_referrals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_link_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL,
  "event_type" "PartnerLinkEventType" NOT NULL,
  "actor_profile_id" UUID,
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_link_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_referral_payment_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referral_id" UUID NOT NULL,
  "previous_status" "PartnerPaymentStatus" NOT NULL,
  "new_status" "PartnerPaymentStatus" NOT NULL,
  "source" "PartnerPaymentSource" NOT NULL,
  "provider_event_id" TEXT,
  "subscription_id" UUID,
  "changed_by_id" UUID,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_referral_payment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "partner_referral_seen_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referral_id" UUID NOT NULL,
  "previous_seen_at" TIMESTAMP(3),
  "new_seen_at" TIMESTAMP(3),
  "changed_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_referral_seen_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partners_referral_code_key" ON "partners"("referral_code");
CREATE UNIQUE INDEX "partners_referral_code_hash_key" ON "partners"("referral_code_hash");
CREATE INDEX "partners_deleted_at_link_status_idx" ON "partners"("deleted_at", "link_status");
CREATE INDEX "partners_created_by_id_idx" ON "partners"("created_by_id");
CREATE INDEX "partners_created_at_idx" ON "partners"("created_at");

CREATE UNIQUE INDEX "partner_referrals_referred_profile_id_key" ON "partner_referrals"("referred_profile_id");
CREATE INDEX "partner_referrals_partner_id_created_at_idx" ON "partner_referrals"("partner_id", "created_at");
CREATE INDEX "partner_referrals_referred_tenant_id_idx" ON "partner_referrals"("referred_tenant_id");
CREATE INDEX "partner_referrals_payment_status_created_at_idx" ON "partner_referrals"("payment_status", "created_at");
CREATE INDEX "partner_referrals_seen_at_idx" ON "partner_referrals"("seen_at");
CREATE INDEX "partner_referrals_created_at_idx" ON "partner_referrals"("created_at");

CREATE INDEX "partner_link_events_partner_id_created_at_idx" ON "partner_link_events"("partner_id", "created_at");
CREATE INDEX "partner_link_events_created_at_idx" ON "partner_link_events"("created_at");
CREATE INDEX "partner_referral_payment_events_referral_id_created_at_idx" ON "partner_referral_payment_events"("referral_id", "created_at");
CREATE INDEX "partner_referral_payment_events_source_provider_event_id_idx" ON "partner_referral_payment_events"("source", "provider_event_id");
CREATE UNIQUE INDEX "partner_payment_provider_event_key"
  ON "partner_referral_payment_events"("source", "provider_event_id")
  WHERE "provider_event_id" IS NOT NULL;
CREATE INDEX "partner_referral_payment_events_created_at_idx" ON "partner_referral_payment_events"("created_at");
CREATE INDEX "partner_referral_seen_events_referral_id_created_at_idx" ON "partner_referral_seen_events"("referral_id", "created_at");
CREATE INDEX "partner_referral_seen_events_created_at_idx" ON "partner_referral_seen_events"("created_at");

ALTER TABLE "partners"
  ADD CONSTRAINT "partners_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partners_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_referrals"
  ADD CONSTRAINT "partner_referrals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referrals_referred_profile_id_fkey" FOREIGN KEY ("referred_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referrals_referred_tenant_id_fkey" FOREIGN KEY ("referred_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referrals_referred_branch_id_fkey" FOREIGN KEY ("referred_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referrals_seen_by_id_fkey" FOREIGN KEY ("seen_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_link_events"
  ADD CONSTRAINT "partner_link_events_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_link_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_referral_payment_events"
  ADD CONSTRAINT "partner_referral_payment_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "partner_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referral_payment_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referral_payment_events_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "partner_referral_seen_events"
  ADD CONSTRAINT "partner_referral_seen_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "partner_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "partner_referral_seen_events_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_link_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_referral_payment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_referral_seen_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_service_role_all" ON "partners"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "partner_referrals_service_role_all" ON "partner_referrals"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "partner_link_events_service_role_all" ON "partner_link_events"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "partner_payment_events_service_role_all" ON "partner_referral_payment_events"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "partner_seen_events_service_role_all" ON "partner_referral_seen_events"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
