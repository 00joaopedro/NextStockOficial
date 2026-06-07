-- Agenda Pet production hardening.
-- Additive only: keeps legacy text/date fields and does not rewrite business data.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgendaPetStatus') THEN
    CREATE TYPE "AgendaPetStatus" AS ENUM (
      'scheduled',
      'confirmed',
      'in_progress',
      'completed',
      'canceled',
      'no_show'
    );
  END IF;
END $$;

ALTER TABLE "agenda_pets"
  ADD COLUMN IF NOT EXISTS "start_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "end_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" "AgendaPetStatus" NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "updated_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "canceled_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "canceled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "agenda_pets_tenantId_branch_id_start_at_idx"
  ON "agenda_pets"("tenantId", "branch_id", "start_at");
CREATE INDEX IF NOT EXISTS "agenda_pets_tenantId_branch_id_status_idx"
  ON "agenda_pets"("tenantId", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "agenda_pets_tenantId_branch_id_client_id_idx"
  ON "agenda_pets"("tenantId", "branch_id", "client_id");
CREATE INDEX IF NOT EXISTS "agenda_pets_tenantId_branch_id_pet_id_idx"
  ON "agenda_pets"("tenantId", "branch_id", "pet_id");
CREATE INDEX IF NOT EXISTS "agenda_pets_deleted_at_idx"
  ON "agenda_pets"("deleted_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_created_by_id_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_updated_by_id_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agenda_pets_canceled_by_id_fkey') THEN
    ALTER TABLE "agenda_pets"
      ADD CONSTRAINT "agenda_pets_canceled_by_id_fkey"
      FOREIGN KEY ("canceled_by_id") REFERENCES "profiles"("id")
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
