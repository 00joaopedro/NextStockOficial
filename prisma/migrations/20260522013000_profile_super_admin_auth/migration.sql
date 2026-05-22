DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum
       WHERE enumlabel = 'superAdmin'
         AND enumtypid = '"Role"'::regtype
     ) THEN
    ALTER TYPE "Role" ADD VALUE 'superAdmin';
  END IF;
END
$$;

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "system_type" "SystemType",
  ADD COLUMN IF NOT EXISTS "allowed_system_types" "SystemType"[] NOT NULL DEFAULT ARRAY[]::"SystemType"[],
  ADD COLUMN IF NOT EXISTS "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "profiles"
SET
  "system_type" = COALESCE(
    "system_type",
    (
      SELECT "system_type"
      FROM "tenants"
      WHERE "tenants"."id" = "profiles"."tenant_id"
      LIMIT 1
    ),
    'padrao'
  )
WHERE "system_type" IS NULL;
