CREATE TYPE "UploadQuotaScope" AS ENUM ('TENANT_TOTAL', 'TENANT_DAILY', 'USER_DAILY');
CREATE TYPE "UploadQuotaReservationState" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'RECONCILIATION_REQUIRED');

CREATE TABLE "upload_quota_counters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "owner_profile_id" UUID,
  "scope" "UploadQuotaScope" NOT NULL,
  "window_start" DATE NOT NULL,
  "byte_limit" BIGINT NOT NULL,
  "file_limit" INTEGER NOT NULL,
  "confirmed_bytes" BIGINT NOT NULL DEFAULT 0,
  "confirmed_files" INTEGER NOT NULL DEFAULT 0,
  "reserved_bytes" BIGINT NOT NULL DEFAULT 0,
  "reserved_files" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_quota_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "upload_quota_counters_nonnegative" CHECK ("confirmed_bytes" >= 0 AND "confirmed_files" >= 0 AND "reserved_bytes" >= 0 AND "reserved_files" >= 0),
  CONSTRAINT "upload_quota_counters_limits" CHECK ("byte_limit" > 0 AND "file_limit" > 0 AND "confirmed_bytes" + "reserved_bytes" <= "byte_limit" AND "confirmed_files" + "reserved_files" <= "file_limit"),
  CONSTRAINT "upload_quota_counters_scope_owner" CHECK (("scope" = 'USER_DAILY') = ("owner_profile_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "upload_quota_counters_scope_key" ON "upload_quota_counters" ("tenant_id", "scope", COALESCE("owner_profile_id", '00000000-0000-0000-0000-000000000000'::uuid), "window_start");
CREATE INDEX "upload_quota_counters_tenant_id_window_start_idx" ON "upload_quota_counters"("tenant_id", "window_start");

CREATE TABLE "upload_quota_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "owner_profile_id" UUID,
  "idempotency_key" TEXT NOT NULL,
  "intent_hash" TEXT NOT NULL,
  "requested_bytes" BIGINT NOT NULL,
  "requested_files" INTEGER NOT NULL,
  "state" "UploadQuotaReservationState" NOT NULL DEFAULT 'RESERVED',
  "object_keys" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "claimed_at" TIMESTAMP(3),
  "confirmed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "last_error" TEXT,
  "reconciliation_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "upload_quota_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "upload_quota_reservations_positive" CHECK ("requested_bytes" >= 0 AND "requested_files" > 0),
  CONSTRAINT "upload_quota_reservations_branch_tenant_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "upload_quota_reservations_owner_tenant_fkey" FOREIGN KEY ("tenant_id", "owner_profile_id") REFERENCES "tenant_members"("tenant_id", "user_profile_id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "upload_quota_reservations_tenant_id_idempotency_key_key" ON "upload_quota_reservations"("tenant_id", "idempotency_key");
CREATE INDEX "upload_quota_reservations_state_expires_at_idx" ON "upload_quota_reservations"("state", "expires_at");
CREATE INDEX "upload_quota_reservations_tenant_id_branch_id_idx" ON "upload_quota_reservations"("tenant_id", "branch_id");

ALTER TABLE "upload_quota_counters" ADD CONSTRAINT "upload_quota_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "upload_quota_counters" ADD CONSTRAINT "upload_quota_counters_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;
ALTER TABLE "upload_quota_reservations" ADD CONSTRAINT "upload_quota_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "upload_quota_reservations" ADD CONSTRAINT "upload_quota_reservations_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL;
ALTER TABLE "stored_files" ADD COLUMN "quota_reservation_id" UUID;
CREATE UNIQUE INDEX "stored_files_quota_reservation_id_key" ON "stored_files"("quota_reservation_id");
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_quota_reservation_id_fkey" FOREIGN KEY ("quota_reservation_id") REFERENCES "upload_quota_reservations"("id") ON DELETE SET NULL;

-- Existing rows become confirmed usage before the new protocol is enabled.
INSERT INTO "upload_quota_counters" ("tenant_id", "scope", "window_start", "byte_limit", "file_limit", "confirmed_bytes", "confirmed_files")
SELECT t.id, 'TENANT_TOTAL', DATE '1970-01-01', 9223372036854775807, 2147483647,
       COALESCE(SUM(sf."size_bytes") FILTER (WHERE sf.status = 'ACTIVE'), 0),
       COUNT(sf.id) FILTER (WHERE sf.status = 'ACTIVE')::int
FROM tenants t LEFT JOIN stored_files sf ON sf."tenant_id" = t.id GROUP BY t.id;

INSERT INTO "upload_quota_counters" ("tenant_id", "scope", "window_start", "byte_limit", "file_limit", "confirmed_bytes", "confirmed_files")
SELECT t.id, 'TENANT_DAILY', CURRENT_DATE, 9223372036854775807, 2147483647,
       COALESCE(SUM(sf."size_bytes"), 0), COUNT(sf.id)::int
FROM tenants t LEFT JOIN stored_files sf ON sf."tenant_id" = t.id AND sf."uploaded_at" >= CURRENT_DATE GROUP BY t.id;

INSERT INTO "upload_quota_counters" ("tenant_id", "owner_profile_id", "scope", "window_start", "byte_limit", "file_limit", "confirmed_bytes", "confirmed_files")
SELECT sf."tenant_id", sf."owner_profile_id", 'USER_DAILY', CURRENT_DATE, 9223372036854775807, 2147483647,
       SUM(sf."size_bytes"), COUNT(sf.id)::int
FROM stored_files sf
WHERE sf."owner_profile_id" IS NOT NULL AND sf."uploaded_at" >= CURRENT_DATE
GROUP BY sf."tenant_id", sf."owner_profile_id";
