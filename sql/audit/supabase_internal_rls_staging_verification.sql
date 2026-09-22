-- Read-only staging verification. Returns role classifications and ACL flags only;
-- it never reads application rows or prints connection strings/project references.
WITH target_tables(table_name) AS (
  SELECT unnest(ARRAY[
    '_prisma_migrations', 'dev_workspaces', 'billing_checkout_intents',
    'upload_quota_reservations', 'upload_quota_counters', 'user_provisionings',
    'user_provisioning_events', 'auth_email_claims', 'local_credentials',
    'password_reset_tokens', 'auth_identities', 'oauth_intents',
    'auth_migration_ledger'
  ]::text[])
), roles(role_label, role_oid) AS (
  SELECT listed.role_name, r.oid
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']::text[]) AS listed(role_name)
  JOIN pg_roles r ON r.rolname = listed.role_name
  UNION ALL
  SELECT 'current_user', r.oid FROM pg_roles r WHERE r.rolname = current_user
  UNION ALL
  SELECT 'session_user', r.oid FROM pg_roles r WHERE r.rolname = session_user
)
SELECT
  t.table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  CASE
    WHEN c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'postgres') THEN 'postgres_owner'
    WHEN c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'service_role') THEN 'service_role_owner'
    ELSE 'other_owner'
  END AS owner_class,
  CASE WHEN r.rolsuper THEN 'superuser'
       WHEN r.rolbypassrls THEN 'bypassrls'
       ELSE 'ordinary_role' END AS role_class,
  (c.relowner = r.oid) AS role_is_owner,
  has_table_privilege(r.rolname, c.oid, 'SELECT') AS can_select,
  has_table_privilege(r.rolname, c.oid, 'INSERT') AS can_insert,
  has_table_privilege(r.rolname, c.oid, 'UPDATE') AS can_update,
  has_table_privilege(r.rolname, c.oid, 'DELETE') AS can_delete
FROM target_tables t
LEFT JOIN pg_class c ON c.relname = t.table_name AND c.relnamespace = 'public'::regnamespace
CROSS JOIN roles wanted
JOIN pg_roles r ON r.oid = wanted.role_oid
ORDER BY t.table_name, wanted.role_label;

SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = ANY (ARRAY[
    '_prisma_migrations', 'dev_workspaces', 'billing_checkout_intents',
    'upload_quota_reservations', 'upload_quota_counters', 'user_provisionings',
    'user_provisioning_events', 'auth_email_claims', 'local_credentials',
    'password_reset_tokens', 'auth_identities', 'oauth_intents',
    'auth_migration_ledger'
  ])
ORDER BY tablename, policyname;
