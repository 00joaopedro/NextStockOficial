-- NextStock Dev/multi-tenant audit.
-- Safe diagnostics only: SELECT statements, no data changes.

-- 1. Dev/superAdmins, tenants, branches and modes.
SELECT p.id, p.email, p.supabase_user_id, p.role, p.is_super_admin,
       p.system_type AS profile_system_type, p.allowed_system_types,
       p.tenant_id, p.primary_tenant_id,
       tm.tenant_id AS membership_tenant_id, tm.branch_id,
       t.name AS tenant_name, t.slug AS tenant_slug,
       t.system_type AS tenant_system_type, t.mode,
       b.name AS branch_name, b.slug AS branch_slug, b.is_active
FROM profiles p
LEFT JOIN tenant_members tm ON tm.user_profile_id = p.id
LEFT JOIN tenants t ON t.id = tm.tenant_id
LEFT JOIN branches b ON b.id = tm.branch_id
WHERE p.role = 'superAdmin' OR p.is_super_admin = true
ORDER BY p.email, t.system_type, t.name;

-- 2. Profiles linked to memberships from multiple system types.
SELECT p.id, p.email, COUNT(DISTINCT t.system_type) AS system_type_count,
       ARRAY_AGG(DISTINCT t.system_type) AS system_types
FROM profiles p
JOIN tenant_members tm ON tm.user_profile_id = p.id
JOIN tenants t ON t.id = tm.tenant_id
GROUP BY p.id, p.email
HAVING COUNT(DISTINCT t.system_type) > 1;

-- 3. tenant_id and primary_tenant_id pointing to different system types.
SELECT p.id, p.email, p.system_type,
       t1.system_type AS tenant_system_type,
       t2.system_type AS primary_tenant_system_type
FROM profiles p
LEFT JOIN tenants t1 ON t1.id = p.tenant_id
LEFT JOIN tenants t2 ON t2.id = p.primary_tenant_id
WHERE t1.system_type IS DISTINCT FROM t2.system_type;

-- 4. Membership with missing branch, inactive branch, or branch from another tenant.
SELECT tm.id, tm.user_profile_id, tm.tenant_id, tm.branch_id,
       b.tenant_id AS branch_tenant_id, b.is_active
FROM tenant_members tm
LEFT JOIN branches b ON b.id = tm.branch_id
WHERE tm.branch_id IS NULL
   OR b.id IS NULL
   OR b.is_active IS DISTINCT FROM true
   OR b.tenant_id IS DISTINCT FROM tm.tenant_id;

-- 5. Common users with unexpectedly broad allowed_system_types.
SELECT id, email, role, is_super_admin, system_type, allowed_system_types
FROM profiles
WHERE role <> 'superAdmin'
  AND is_super_admin = false
  AND allowed_system_types @> ARRAY['padrao', 'petshop']::"SystemType"[];

-- 6. Products and payment machines without branch.
SELECT 'products' AS source, COUNT(*) AS records_without_branch
FROM products WHERE branch_id IS NULL
UNION ALL
SELECT 'payment_machines', COUNT(*)
FROM payment_machines WHERE branch_id IS NULL;

-- 7. Pet Shop records in non-Pet Shop tenants.
SELECT 'pet_clients' AS source, pc.id, pc.tenant_id, pc.branch_id, t.system_type
FROM pet_clients pc JOIN tenants t ON t.id = pc.tenant_id
WHERE t.system_type <> 'petshop'
UNION ALL
SELECT 'pets', p.id, p.tenant_id, p.branch_id, t.system_type
FROM pets p JOIN tenants t ON t.id = p.tenant_id
WHERE t.system_type <> 'petshop'
UNION ALL
SELECT 'pet_photos', pp.id, pp.tenant_id, pp.branch_id, t.system_type
FROM pet_photos pp JOIN tenants t ON t.id = pp.tenant_id
WHERE t.system_type <> 'petshop';

-- 8. Pets linked to clients from another tenant/branch.
SELECT p.id, p.tenant_id, p.branch_id, p.client_id,
       pc.tenant_id AS client_tenant_id, pc.branch_id AS client_branch_id
FROM pets p
JOIN pet_clients pc ON pc.id = p.client_id
WHERE p.tenant_id IS DISTINCT FROM pc.tenant_id
   OR p.branch_id IS DISTINCT FROM pc.branch_id;

-- 9. Pet photos linked to pets from another tenant/branch.
SELECT pp.id, pp.tenant_id, pp.branch_id, pp.pet_id,
       p.tenant_id AS pet_tenant_id, p.branch_id AS pet_branch_id
FROM pet_photos pp
JOIN pets p ON p.id = pp.pet_id
WHERE pp.tenant_id IS DISTINCT FROM p.tenant_id
   OR pp.branch_id IS DISTINCT FROM p.branch_id;

-- 10. Usage events without operational context.
SELECT COUNT(*) AS events_without_context
FROM user_usage_events
WHERE tenant_id IS NULL OR branch_id IS NULL OR system_type IS NULL;

-- 11. NOT VALID constraints.
SELECT conrelid::regclass AS table_name, conname, contype, convalidated
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND convalidated = false;

-- 12. RLS and policies.
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 13. Missing Dev workspaces by system type.
SELECT p.id, p.email, expected.system_type
FROM profiles p
CROSS JOIN (VALUES ('padrao'::"SystemType"), ('petshop'::"SystemType")) AS expected(system_type)
LEFT JOIN dev_workspaces dw
  ON dw.dev_user_id = p.id
 AND dw.system_type = expected.system_type
WHERE (p.role = 'superAdmin' OR p.is_super_admin = true)
  AND dw.id IS NULL;

-- 14. Dev workspaces pointing to tenants/branches with wrong system type.
SELECT dw.id, p.email, dw.system_type AS workspace_system_type,
       t.system_type AS tenant_system_type, b.tenant_id AS branch_tenant_id,
       dw.tenant_id, dw.branch_id
FROM dev_workspaces dw
JOIN profiles p ON p.id = dw.dev_user_id
JOIN tenants t ON t.id = dw.tenant_id
JOIN branches b ON b.id = dw.branch_id
WHERE t.system_type IS DISTINCT FROM dw.system_type
   OR b.tenant_id IS DISTINCT FROM dw.tenant_id;

-- 15. Missing Dev branch by system type.
SELECT dw.id, p.email, dw.system_type, dw.branch_id
FROM dev_workspaces dw
JOIN profiles p ON p.id = dw.dev_user_id
LEFT JOIN branches b ON b.id = dw.branch_id
WHERE b.id IS NULL OR b.is_active IS DISTINCT FROM true;
