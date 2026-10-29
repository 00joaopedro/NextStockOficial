ALTER TABLE "user_usage_events" ADD COLUMN IF NOT EXISTS "provider" TEXT;
CREATE INDEX IF NOT EXISTS "user_usage_events_provider_created_at_idx" ON "user_usage_events" ("provider", "created_at");
