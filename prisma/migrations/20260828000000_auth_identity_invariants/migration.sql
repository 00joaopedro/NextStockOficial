-- PR 2: adapt the existing identity table without changing UserProfile IDs or
-- importing any external authentication data.
CREATE TYPE "AuthIdentityProvider" AS ENUM ('google', 'supabase');

ALTER TABLE "auth_identities"
  DROP CONSTRAINT "auth_identities_canonical_email_fkey",
  DROP CONSTRAINT "auth_identities_profile_id_fkey";

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

DROP INDEX "auth_identities_provider_canonical_email_key";

ALTER TABLE "auth_identities"
  ALTER COLUMN "canonical_email" DROP NOT NULL,
  ALTER COLUMN "provider" TYPE "AuthIdentityProvider"
    USING lower(btrim("provider"))::"AuthIdentityProvider",
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "last_used_at" TIMESTAMP(3),
  ADD COLUMN "disabled_at" TIMESTAMP(3);

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_provider_subject_nonempty_check"
    CHECK (length(btrim("provider_user_id")) > 0),
  ADD CONSTRAINT "auth_identities_canonical_email_normalized_check"
    CHECK ("canonical_email" IS NULL OR "canonical_email" = lower(btrim("canonical_email")));

DROP INDEX "auth_identities_provider_profile_id_key";
CREATE UNIQUE INDEX "auth_identities_profile_id_provider_key"
  ON "auth_identities"("profile_id", "provider");
CREATE INDEX "auth_identities_profile_id_idx" ON "auth_identities"("profile_id");
CREATE INDEX "auth_identities_provider_canonical_email_idx"
  ON "auth_identities"("provider", "canonical_email");
