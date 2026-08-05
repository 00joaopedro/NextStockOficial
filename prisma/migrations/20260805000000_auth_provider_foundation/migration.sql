CREATE TABLE "auth_email_claims" (
  "canonical_email" TEXT NOT NULL,
  "profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_email_claims_pkey" PRIMARY KEY ("canonical_email"),
  CONSTRAINT "auth_email_claims_profile_id_key" UNIQUE ("profile_id"),
  CONSTRAINT "auth_email_claims_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE
);

CREATE TABLE "auth_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_user_id" TEXT NOT NULL,
  "canonical_email" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_identities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "auth_identities_canonical_email_fkey" FOREIGN KEY ("canonical_email") REFERENCES "auth_email_claims"("canonical_email") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "auth_identities_provider_provider_user_id_key" ON "auth_identities"("provider", "provider_user_id");
CREATE UNIQUE INDEX "auth_identities_provider_profile_id_key" ON "auth_identities"("provider", "profile_id");
CREATE UNIQUE INDEX "auth_identities_provider_canonical_email_key" ON "auth_identities"("provider", "canonical_email");
CREATE INDEX "auth_identities_profile_id_status_idx" ON "auth_identities"("profile_id", "status");

-- Only deterministic, locally available identities are backfilled. Ambiguous
-- case-insensitive legacy e-mails remain intentionally pending reconciliation.
WITH deterministic AS (
  SELECT lower(btrim(email)) AS canonical_email, min(id) AS profile_id
  FROM profiles
  WHERE "supabase_user_id" IS NOT NULL
  GROUP BY lower(btrim(email))
  HAVING count(DISTINCT id) = 1
)
INSERT INTO "auth_email_claims" ("canonical_email", "profile_id")
SELECT canonical_email, profile_id FROM deterministic
ON CONFLICT DO NOTHING;

INSERT INTO "auth_identities" ("profile_id", "provider", "provider_user_id", "canonical_email")
SELECT p.id, 'supabase', p."supabase_user_id"::text, lower(btrim(p.email))
FROM profiles p
JOIN "auth_email_claims" c ON c."profile_id" = p.id
WHERE p."supabase_user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
