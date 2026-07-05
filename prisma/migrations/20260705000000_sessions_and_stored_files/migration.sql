CREATE TYPE "StoredFileVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'SIGNED_ONLY');
CREATE TYPE "StoredFileScanStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED', 'REJECTED');
CREATE TYPE "StoredFileStatus" AS ENUM ('ACTIVE', 'DELETED', 'ORPHANED', 'QUARANTINED');

CREATE TABLE "user_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL,
  "tenant_id" UUID,
  "token_id_hash" TEXT NOT NULL,
  "jwt_subject" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "revoked_reason" TEXT,
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "device_label" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_sessions_token_id_hash_key" ON "user_sessions"("token_id_hash");
CREATE INDEX "user_sessions_profile_id_created_at_idx" ON "user_sessions"("profile_id", "created_at");
CREATE INDEX "user_sessions_profile_id_revoked_at_idx" ON "user_sessions"("profile_id", "revoked_at");
CREATE INDEX "user_sessions_tenant_id_created_at_idx" ON "user_sessions"("tenant_id", "created_at");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
CREATE INDEX "user_sessions_revoked_at_idx" ON "user_sessions"("revoked_at");

CREATE TABLE "stored_files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "owner_profile_id" UUID,
  "module" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "bucket" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "original_name" TEXT,
  "mime_type" TEXT NOT NULL,
  "extension" TEXT,
  "size_bytes" BIGINT NOT NULL,
  "sha256" TEXT,
  "visibility" "StoredFileVisibility" NOT NULL DEFAULT 'SIGNED_ONLY',
  "scan_status" "StoredFileScanStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "status" "StoredFileStatus" NOT NULL DEFAULT 'ACTIVE',
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  "last_accessed_at" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stored_files_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stored_files_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stored_files_size_positive" CHECK ("size_bytes" >= 0)
);

CREATE UNIQUE INDEX "stored_files_bucket_storage_path_key" ON "stored_files"("bucket", "storage_path");
CREATE INDEX "stored_files_tenant_id_module_uploaded_at_idx" ON "stored_files"("tenant_id", "module", "uploaded_at");
CREATE INDEX "stored_files_tenant_id_status_idx" ON "stored_files"("tenant_id", "status");
CREATE INDEX "stored_files_target_type_target_id_idx" ON "stored_files"("target_type", "target_id");
CREATE INDEX "stored_files_sha256_idx" ON "stored_files"("sha256");
CREATE INDEX "stored_files_owner_profile_id_uploaded_at_idx" ON "stored_files"("owner_profile_id", "uploaded_at");

ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stored_files" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "user_sessions", "stored_files" FROM anon, authenticated;
CREATE POLICY "user_sessions_service_role_all" ON "user_sessions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "stored_files_service_role_all" ON "stored_files" FOR ALL TO service_role USING (true) WITH CHECK (true);
