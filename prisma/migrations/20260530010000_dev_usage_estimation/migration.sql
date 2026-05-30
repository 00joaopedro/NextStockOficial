CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "public"."user_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "system_type" TEXT,
    "branch_name" TEXT,
    "event_type" TEXT NOT NULL,
    "page" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_usage_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."user_usage_events"
    ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
    ADD COLUMN IF NOT EXISTS "branch_id" UUID,
    ADD COLUMN IF NOT EXISTS "route" TEXT,
    ADD COLUMN IF NOT EXISTS "method" TEXT,
    ADD COLUMN IF NOT EXISTS "status_code" INTEGER,
    ADD COLUMN IF NOT EXISTS "duration_ms" INTEGER,
    ADD COLUMN IF NOT EXISTS "weight" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "db_read_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "db_write_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "response_bytes" INTEGER,
    ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "user_usage_events_user_id_idx"
    ON "public"."user_usage_events"("user_id");

CREATE INDEX IF NOT EXISTS "user_usage_events_created_at_idx"
    ON "public"."user_usage_events"("created_at");

CREATE INDEX IF NOT EXISTS "user_usage_events_system_type_idx"
    ON "public"."user_usage_events"("system_type");

CREATE INDEX IF NOT EXISTS "user_usage_events_user_id_created_at_idx"
    ON "public"."user_usage_events"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "user_usage_events_tenant_id_created_at_idx"
    ON "public"."user_usage_events"("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "user_usage_events_event_type_created_at_idx"
    ON "public"."user_usage_events"("event_type", "created_at");

CREATE INDEX IF NOT EXISTS "user_usage_events_system_type_created_at_idx"
    ON "public"."user_usage_events"("system_type", "created_at");

CREATE TABLE IF NOT EXISTS "public"."resource_usage_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "value" DECIMAL(18, 6) NOT NULL,
    "unit" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_usage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "resource_usage_snapshots_provider_metric_name_period_start_period_end_idx"
    ON "public"."resource_usage_snapshots"("provider", "metric_name", "period_start", "period_end");
