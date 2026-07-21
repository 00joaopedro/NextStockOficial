-- Read-only staging audit for the failed Prisma migration
-- 20260721010000_branch_storefront.
--
-- Run this file with an administrative connection without printing the
-- connection string. Do not run `prisma migrate resolve` until every result
-- below has been reviewed against the migration file.

-- 1. Prisma's recorded execution. Preserve `logs` internally because it may
-- contain database details; redact it before sharing outside the operations
-- team.
SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count,
  logs
FROM "_prisma_migrations"
WHERE migration_name = '20260721010000_branch_storefront'
ORDER BY started_at;

-- 2. Enums and their values/order.
WITH expected(type_name, enum_value, sort_order) AS (
  VALUES
    ('StorefrontStatus', 'draft', 1),
    ('StorefrontStatus', 'active', 2),
    ('StorefrontStatus', 'paused', 3),
    ('StorefrontStatus', 'suspended', 4),
    ('StorefrontStatus', 'archived', 5),
    ('OrderSource', 'admin', 1),
    ('OrderSource', 'storefront_guest', 2),
    ('FulfillmentType', 'pickup', 1),
    ('FulfillmentType', 'delivery', 2)
), actual AS (
  SELECT
    t.typname::text AS type_name,
    e.enumlabel::text AS enum_value,
    row_number() OVER (PARTITION BY t.oid ORDER BY e.enumsortorder)::int AS sort_order
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
    AND t.typname IN ('StorefrontStatus', 'OrderSource', 'FulfillmentType')
)
SELECT
  expected.type_name,
  expected.enum_value,
  expected.sort_order,
  (actual.type_name IS NOT NULL) AS present_with_expected_order
FROM expected
LEFT JOIN actual USING (type_name, enum_value, sort_order)
ORDER BY expected.type_name, expected.sort_order;

-- 3. Tables and RLS state.
WITH expected(relname) AS (
  VALUES ('storefronts'), ('storefront_products'), ('storefront_slug_redirects')
)
SELECT
  expected.relname,
  to_regclass(format('public.%I', expected.relname)) AS relation,
  COALESCE(c.relrowsecurity, false) AS rls_enabled,
  COALESCE(c.relforcerowsecurity, false) AS rls_forced
FROM expected
LEFT JOIN pg_class c
  ON c.relname = expected.relname
 AND c.relnamespace = 'public'::regnamespace
ORDER BY expected.relname;

-- 4. Every expected column, including the ten columns added to orders.
WITH expected(table_name, column_name, data_type, is_nullable, column_default) AS (
  VALUES
    ('storefronts', 'id', 'uuid', 'NO', 'gen_random_uuid()'),
    ('storefronts', 'tenant_id', 'uuid', 'NO', NULL),
    ('storefronts', 'branch_id', 'uuid', 'NO', NULL),
    ('storefronts', 'public_slug', 'text', 'NO', NULL),
    ('storefronts', 'status', 'USER-DEFINED', 'NO', '''draft''::"StorefrontStatus"'),
    ('storefronts', 'public_name', 'text', 'NO', NULL),
    ('storefronts', 'public_description', 'text', 'YES', NULL),
    ('storefronts', 'ordering_enabled', 'boolean', 'NO', 'false'),
    ('storefronts', 'pickup_enabled', 'boolean', 'NO', 'true'),
    ('storefronts', 'delivery_enabled', 'boolean', 'NO', 'true'),
    ('storefronts', 'published_at', 'timestamp without time zone', 'YES', NULL),
    ('storefronts', 'created_at', 'timestamp without time zone', 'NO', 'CURRENT_TIMESTAMP'),
    ('storefronts', 'updated_at', 'timestamp without time zone', 'NO', 'CURRENT_TIMESTAMP'),
    ('storefront_products', 'id', 'uuid', 'NO', 'gen_random_uuid()'),
    ('storefront_products', 'storefront_id', 'uuid', 'NO', NULL),
    ('storefront_products', 'product_id', 'uuid', 'NO', NULL),
    ('storefront_products', 'public_slug', 'text', 'NO', NULL),
    ('storefront_products', 'is_published', 'boolean', 'NO', 'false'),
    ('storefront_products', 'available_for_online_order', 'boolean', 'NO', 'false'),
    ('storefront_products', 'public_name', 'text', 'YES', NULL),
    ('storefront_products', 'public_description', 'text', 'YES', NULL),
    ('storefront_products', 'sort_order', 'integer', 'NO', '0'),
    ('storefront_products', 'minimum_order_quantity', 'integer', 'NO', '1'),
    ('storefront_products', 'maximum_order_quantity', 'integer', 'YES', NULL),
    ('storefront_products', 'created_at', 'timestamp without time zone', 'NO', 'CURRENT_TIMESTAMP'),
    ('storefront_products', 'updated_at', 'timestamp without time zone', 'NO', 'CURRENT_TIMESTAMP'),
    ('storefront_slug_redirects', 'id', 'uuid', 'NO', 'gen_random_uuid()'),
    ('storefront_slug_redirects', 'storefront_id', 'uuid', 'NO', NULL),
    ('storefront_slug_redirects', 'old_slug', 'text', 'NO', NULL),
    ('storefront_slug_redirects', 'expires_at', 'timestamp without time zone', 'YES', NULL),
    ('storefront_slug_redirects', 'created_at', 'timestamp without time zone', 'NO', 'CURRENT_TIMESTAMP'),
    ('orders', 'source', 'USER-DEFINED', 'NO', '''admin''::"OrderSource"'),
    ('orders', 'storefront_id', 'uuid', 'YES', NULL),
    ('orders', 'public_reference', 'text', 'YES', NULL),
    ('orders', 'public_access_token_hash', 'text', 'YES', NULL),
    ('orders', 'idempotency_key_hash', 'text', 'YES', NULL),
    ('orders', 'idempotency_request_hash', 'text', 'YES', NULL),
    ('orders', 'fulfillment_type', 'USER-DEFINED', 'YES', NULL),
    ('orders', 'delivery_address', 'jsonb', 'YES', NULL),
    ('orders', 'reservation_expires_at', 'timestamp without time zone', 'YES', NULL),
    ('orders', 'stock_restored_at', 'timestamp without time zone', 'YES', NULL)
)
SELECT
  expected.*,
  (columns.column_name IS NOT NULL) AS present,
  columns.udt_name AS actual_udt,
  columns.data_type AS actual_data_type,
  columns.is_nullable AS actual_is_nullable,
  columns.column_default AS actual_default
FROM expected
LEFT JOIN information_schema.columns columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;

-- 5. Primary keys, foreign keys and the quantity check. The definition makes
-- cross-tenant targets and delete actions visible for manual comparison.
WITH expected(constraint_name) AS (
  VALUES
    ('storefronts_pkey'),
    ('storefronts_tenant_id_fkey'),
    ('storefronts_branch_id_tenant_id_fkey'),
    ('storefront_products_pkey'),
    ('storefront_products_storefront_id_fkey'),
    ('storefront_products_product_id_fkey'),
    ('storefront_products_quantity_check'),
    ('storefront_slug_redirects_pkey'),
    ('storefront_slug_redirects_storefront_id_fkey'),
    ('orders_storefront_id_fkey')
)
SELECT
  expected.constraint_name,
  con.conname IS NOT NULL AS present,
  con.conrelid::regclass AS table_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition,
  con.convalidated AS validated
FROM expected
LEFT JOIN pg_constraint con
  ON con.conname = expected.constraint_name
 AND con.connamespace = 'public'::regnamespace
ORDER BY expected.constraint_name;

-- 6. All indexes created by the migration, including the precondition index
-- on branches and the four order indexes.
WITH expected(index_name) AS (
  VALUES
    ('branches_id_tenant_id_key'),
    ('storefronts_branch_id_key'),
    ('storefronts_public_slug_key'),
    ('storefronts_branch_id_tenant_id_key'),
    ('storefronts_tenant_id_status_idx'),
    ('storefront_products_storefront_id_product_id_key'),
    ('storefront_products_storefront_id_public_slug_key'),
    ('storefront_products_storefront_id_is_published_sort_order_idx'),
    ('storefront_products_product_id_idx'),
    ('storefront_slug_redirects_old_slug_key'),
    ('storefront_slug_redirects_storefront_id_idx'),
    ('orders_public_reference_key'),
    ('orders_storefront_id_idempotency_key_hash_key'),
    ('orders_storefront_id_status_created_at_idx'),
    ('orders_source_reservation_expires_at_stock_restored_at_idx')
)
SELECT
  expected.index_name,
  indexes.indexname IS NOT NULL AS present,
  indexes.tablename,
  indexes.indexdef
FROM expected
LEFT JOIN pg_indexes indexes
  ON indexes.schemaname = 'public'
 AND indexes.indexname = expected.index_name
ORDER BY expected.index_name;

-- 7. Policies must grant ALL only to service_role, with true USING and CHECK.
WITH expected(table_name, policy_name) AS (
  VALUES
    ('storefronts', 'storefronts_service_role_all'),
    ('storefront_products', 'storefront_products_service_role_all'),
    ('storefront_slug_redirects', 'storefront_slug_redirects_service_role_all')
)
SELECT
  expected.table_name,
  expected.policy_name,
  policies.policyname IS NOT NULL AS present,
  policies.permissive,
  policies.roles,
  policies.cmd,
  policies.qual,
  policies.with_check
FROM expected
LEFT JOIN pg_policies policies
  ON policies.schemaname = 'public'
 AND policies.tablename = expected.table_name
 AND policies.policyname = expected.policy_name
ORDER BY expected.table_name;

-- 8. The migration revokes every direct table privilege from Supabase's anon
-- and authenticated roles. Missing roles are reported rather than causing this
-- audit to fail.
WITH expected(table_name) AS (
  VALUES ('storefronts'), ('storefront_products'), ('storefront_slug_redirects')
), roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
)
SELECT
  expected.table_name,
  roles.role_name,
  pg_roles.rolname IS NOT NULL AS role_exists,
  COALESCE(string_agg(grants.privilege_type, ', ' ORDER BY grants.privilege_type), 'NONE') AS direct_privileges
FROM expected
CROSS JOIN roles
LEFT JOIN pg_roles ON pg_roles.rolname = roles.role_name
LEFT JOIN information_schema.role_table_grants grants
  ON grants.table_schema = 'public'
 AND grants.table_name = expected.table_name
 AND grants.grantee = roles.role_name
GROUP BY expected.table_name, roles.role_name, pg_roles.rolname
ORDER BY expected.table_name, roles.role_name;
