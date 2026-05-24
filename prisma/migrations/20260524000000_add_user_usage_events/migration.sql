CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "user_usage_events" (
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

CREATE INDEX "user_usage_events_user_id_idx" ON "user_usage_events"("user_id");
CREATE INDEX "user_usage_events_created_at_idx" ON "user_usage_events"("created_at");
CREATE INDEX "user_usage_events_system_type_idx" ON "user_usage_events"("system_type");
