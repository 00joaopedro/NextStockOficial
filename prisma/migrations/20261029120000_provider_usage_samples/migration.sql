CREATE TABLE IF NOT EXISTS "provider_usage_samples" (
  "provider" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "hour_start" TIMESTAMP(3) NOT NULL,
  "instance_count" DOUBLE PRECISION NOT NULL,
  "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_usage_samples_pkey" PRIMARY KEY ("provider", "service_id", "hour_start"),
  CONSTRAINT "provider_usage_samples_nonnegative" CHECK ("instance_count" >= 0)
);
CREATE TABLE IF NOT EXISTS "usage_capture_gaps" (
  "id" UUID NOT NULL,
  "provider" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL,
  "ended_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_capture_gaps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "usage_capture_gaps_time_idx" ON "usage_capture_gaps" ("started_at", "ended_at");
