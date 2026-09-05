CREATE TABLE "oauth_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "nonce_hash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "profile_id" UUID,
  "session_id" UUID,
  "redirect_to" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_intents_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "oauth_intents_state_hash_key" ON "oauth_intents"("state_hash");
CREATE INDEX "oauth_intents_provider_expires_at_idx" ON "oauth_intents"("provider", "expires_at");
CREATE INDEX "oauth_intents_expires_at_idx" ON "oauth_intents"("expires_at");
