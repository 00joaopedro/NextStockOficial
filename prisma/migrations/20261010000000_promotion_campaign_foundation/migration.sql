CREATE TYPE "PromotionCampaignStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'CLOSED',
  'EXHAUSTED'
);

CREATE TYPE "PromotionReservationStatus" AS ENUM (
  'RESERVED',
  'CONVERTED',
  'RELEASED',
  'EXPIRED',
  'CANCELED'
);

CREATE TABLE "promotion_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "PromotionCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "max_conversions" INTEGER NOT NULL DEFAULT 30,
  "reserved_count" INTEGER NOT NULL DEFAULT 0,
  "converted_count" INTEGER NOT NULL DEFAULT 0,
  "trial_days" INTEGER NOT NULL DEFAULT 1,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "close_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "promotion_campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_campaigns_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  CONSTRAINT "promotion_campaigns_limit_check" CHECK ("max_conversions" > 0),
  CONSTRAINT "promotion_campaigns_trial_check" CHECK ("trial_days" BETWEEN 1 AND 31),
  CONSTRAINT "promotion_campaigns_counter_check" CHECK (
    "reserved_count" >= 0 AND "converted_count" >= 0
  )
);

CREATE UNIQUE INDEX "promotion_campaigns_slug_key"
  ON "promotion_campaigns"("slug");

CREATE INDEX "promotion_campaigns_status_dates_idx"
  ON "promotion_campaigns"("status", "starts_at", "ends_at");

CREATE TABLE "promotion_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "partner_id" UUID,
  "idempotency_key" TEXT NOT NULL,
  "status" "PromotionReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "converted_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "release_reason" TEXT,
  "metadata" JSONB,

  CONSTRAINT "promotion_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_reservations_campaign_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "promotion_campaigns"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "promotion_reservations_campaign_tenant_key"
  ON "promotion_reservations"("campaign_id", "tenant_id");

CREATE UNIQUE INDEX "promotion_reservations_campaign_idempotency_key"
  ON "promotion_reservations"("campaign_id", "idempotency_key");

CREATE INDEX "promotion_reservations_tenant_status_idx"
  ON "promotion_reservations"("tenant_id", "status");

CREATE INDEX "promotion_reservations_expiry_idx"
  ON "promotion_reservations"("status", "expires_at");
