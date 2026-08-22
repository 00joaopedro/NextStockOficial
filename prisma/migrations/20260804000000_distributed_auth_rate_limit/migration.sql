CREATE TYPE "AuthRateLimitIdentity" AS ENUM ('IP', 'ACCOUNT');

CREATE TABLE "auth_rate_limit_buckets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "action" TEXT NOT NULL,
  "identity_type" "AuthRateLimitIdentity" NOT NULL,
  "identity_hash" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_ends_at" TIMESTAMP(3) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_rate_limit_buckets_attempt_count_check" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "auth_rate_limit_buckets_action_identity_type_identity_hash_window_start_key"
  ON "auth_rate_limit_buckets"("action", "identity_type", "identity_hash", "window_start");
CREATE INDEX "auth_rate_limit_buckets_window_ends_at_idx"
  ON "auth_rate_limit_buckets"("window_ends_at");

ALTER TABLE "auth_rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "auth_rate_limit_buckets" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "auth_rate_limit_buckets" TO service_role;
