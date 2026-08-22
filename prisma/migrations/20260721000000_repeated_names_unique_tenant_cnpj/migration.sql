-- Names are display values and may repeat. Authentication remains keyed by e-mail/UUID.
DROP INDEX IF EXISTS "profiles_access_name_normalized_key";

-- Tenant CNPJs are stored as digits so formatting cannot bypass uniqueness.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tenants"
    WHERE NULLIF(regexp_replace(COALESCE("cnpj", ''), '[^0-9]', '', 'g'), '') IS NOT NULL
    GROUP BY NULLIF(regexp_replace("cnpj", '[^0-9]', '', 'g'), '')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique tenant CNPJ: normalized duplicates exist';
  END IF;
END $$;

UPDATE "tenants"
SET "cnpj" = NULLIF(regexp_replace(COALESCE("cnpj", ''), '[^0-9]', '', 'g'), '')
WHERE "cnpj" IS DISTINCT FROM NULLIF(regexp_replace(COALESCE("cnpj", ''), '[^0-9]', '', 'g'), '');

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_cnpj_key" ON "tenants"("cnpj");
