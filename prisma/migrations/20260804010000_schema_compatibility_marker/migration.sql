CREATE TABLE IF NOT EXISTS "schema_compatibility_markers" (
  "version" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "migration_name" TEXT NOT NULL,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schema_compatibility_markers_pkey" PRIMARY KEY ("version"),
  CONSTRAINT "schema_compatibility_markers_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "schema_compatibility_markers_description_not_blank_check" CHECK (length(btrim("description")) BETWEEN 1 AND 200),
  CONSTRAINT "schema_compatibility_markers_migration_name_not_blank_check" CHECK (length(btrim("migration_name")) BETWEEN 1 AND 200)
);

COMMENT ON TABLE "schema_compatibility_markers" IS 'Append-only schema compatibility markers read by readiness checks.';
COMMENT ON COLUMN "schema_compatibility_markers"."version" IS 'Monotonic application schema compatibility version.';

INSERT INTO "schema_compatibility_markers" ("version", "description", "migration_name")
VALUES (1, 'Minimum schema required for REL-016 readiness gating.', '20260804010000_schema_compatibility_marker')
ON CONFLICT ("version") DO NOTHING;

ALTER TABLE "schema_compatibility_markers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "schema_compatibility_markers" FROM anon, authenticated;
GRANT SELECT ON TABLE "schema_compatibility_markers" TO service_role;
CREATE POLICY "schema_compatibility_markers_service_role_read" ON "schema_compatibility_markers" FOR SELECT TO service_role USING (true);
