-- NextStock read-only multi-tenant integrity audit.
-- This file intentionally contains SELECT statements only.

-- Profiles without any membership.
SELECT p.id, p.email, p.tenant_id, p.primary_tenant_id
FROM public.profiles p
LEFT JOIN public.tenant_members tm ON tm.user_profile_id = p.id
WHERE tm.id IS NULL;

-- Profile tenant pointers that disagree with each other or with memberships.
SELECT p.id, p.email, p.tenant_id, p.primary_tenant_id,
       array_agg(DISTINCT tm.tenant_id) FILTER (WHERE tm.tenant_id IS NOT NULL) AS membership_tenants
FROM public.profiles p
LEFT JOIN public.tenant_members tm ON tm.user_profile_id = p.id
GROUP BY p.id, p.email, p.tenant_id, p.primary_tenant_id
HAVING p.tenant_id IS DISTINCT FROM p.primary_tenant_id
    OR (p.tenant_id IS NOT NULL AND bool_or(tm.tenant_id IS DISTINCT FROM p.tenant_id));

-- Memberships without branch or with a branch from another tenant.
SELECT tm.id, tm.user_profile_id, tm.tenant_id, tm.branch_id,
       b.tenant_id AS branch_tenant_id, b.is_active
FROM public.tenant_members tm
LEFT JOIN public.branches b ON b.id = tm.branch_id
WHERE tm.branch_id IS NULL
   OR b.id IS NULL
   OR b.tenant_id IS DISTINCT FROM tm.tenant_id
   OR b.is_active IS NOT TRUE;

-- Duplicate memberships that should be reviewed before changing uniqueness rules.
SELECT tenant_id, user_profile_id, count(*) AS membership_count,
       array_agg(branch_id ORDER BY branch_id) AS branch_ids
FROM public.tenant_members
GROUP BY tenant_id, user_profile_id
HAVING count(*) > 1;

-- Branch-wide records awaiting a manual, reviewed branch assignment.
SELECT 'products' AS source, id, tenant_id,
       NULLIF(to_jsonb(products)->>'branch_id', '')::uuid AS branch_id
FROM public.products
WHERE NOT (to_jsonb(products) ? 'branch_id')
   OR NULLIF(to_jsonb(products)->>'branch_id', '') IS NULL
UNION ALL
SELECT 'payment_machines', id, tenant_id,
       NULLIF(to_jsonb(payment_machines)->>'branch_id', '')::uuid
FROM public.payment_machines
WHERE NOT (to_jsonb(payment_machines) ? 'branch_id')
   OR NULLIF(to_jsonb(payment_machines)->>'branch_id', '') IS NULL
UNION ALL
SELECT 'pet_clients', id, tenant_id, branch_id
FROM public.pet_clients
WHERE branch_id IS NULL
UNION ALL
SELECT 'pets', id, tenant_id, branch_id
FROM public.pets
WHERE branch_id IS NULL
UNION ALL
SELECT 'pet_photos', id, tenant_id, branch_id
FROM public.pet_photos
WHERE branch_id IS NULL
UNION ALL
SELECT 'agenda_pets', id, "tenantId", branch_id
FROM public.agenda_pets
WHERE branch_id IS NULL;

-- Branch-wide records linked to a branch from another tenant.
SELECT 'products' AS source, p.id, p.tenant_id,
       NULLIF(to_jsonb(p)->>'branch_id', '')::uuid AS branch_id,
       b.tenant_id AS branch_tenant_id
FROM public.products p
JOIN public.branches b ON b.id = NULLIF(to_jsonb(p)->>'branch_id', '')::uuid
WHERE p.tenant_id IS DISTINCT FROM b.tenant_id
UNION ALL
SELECT 'payment_machines', pm.id, pm.tenant_id,
       NULLIF(to_jsonb(pm)->>'branch_id', '')::uuid,
       b.tenant_id
FROM public.payment_machines pm
JOIN public.branches b ON b.id = NULLIF(to_jsonb(pm)->>'branch_id', '')::uuid
WHERE pm.tenant_id IS DISTINCT FROM b.tenant_id
UNION ALL
SELECT 'pet_clients', pc.id, pc.tenant_id, pc.branch_id, b.tenant_id
FROM public.pet_clients pc JOIN public.branches b ON b.id = pc.branch_id
WHERE pc.tenant_id IS DISTINCT FROM b.tenant_id;

-- Pets, photos, and agenda with cross-tenant/cross-branch relationships.
SELECT p.id, p.tenant_id, p.branch_id, p.client_id,
       pc.tenant_id AS client_tenant_id, pc.branch_id AS client_branch_id
FROM public.pets p
JOIN public.pet_clients pc ON pc.id = p.client_id
WHERE p.tenant_id IS DISTINCT FROM pc.tenant_id
   OR p.branch_id IS DISTINCT FROM pc.branch_id;

SELECT pp.id, pp.tenant_id, pp.branch_id, pp.pet_id,
       p.tenant_id AS pet_tenant_id, p.branch_id AS pet_branch_id
FROM public.pet_photos pp
JOIN public.pets p ON p.id = pp.pet_id
WHERE pp.tenant_id IS DISTINCT FROM p.tenant_id
   OR pp.branch_id IS DISTINCT FROM p.branch_id;

SELECT a.id, a."tenantId", a.branch_id, a.client_id, a.pet_id,
       pc.tenant_id AS client_tenant_id, pc.branch_id AS client_branch_id,
       p.tenant_id AS pet_tenant_id, p.branch_id AS pet_branch_id
FROM public.agenda_pets a
LEFT JOIN public.pet_clients pc ON pc.id = a.client_id
LEFT JOIN public.pets p ON p.id = a.pet_id
WHERE (pc.id IS NOT NULL AND (
         a."tenantId" IS DISTINCT FROM pc.tenant_id
         OR a.branch_id IS DISTINCT FROM pc.branch_id
      ))
   OR (p.id IS NOT NULL AND (
         a."tenantId" IS DISTINCT FROM p.tenant_id
         OR a.branch_id IS DISTINCT FROM p.branch_id
      ));

-- Suspicious superAdmin grants. Compare with the Railway Dev allowlist.
SELECT id, email, supabase_user_id, role, is_super_admin, tenant_id, primary_tenant_id
FROM public.profiles
WHERE role = 'superAdmin' OR is_super_admin = true;

-- Tenant system/mode inconsistencies.
SELECT id, name, system_type, mode
FROM public.tenants
WHERE system_type IS NULL
   OR mode IS NULL
   OR (system_type = 'padrao' AND mode = 'petshop');

-- Foreign keys intentionally created NOT VALID, pending clean audit results.
SELECT conrelid::regclass AS table_name, conname, contype, convalidated
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND convalidated = false
ORDER BY conrelid::regclass::text, conname;

-- RLS and policies review.
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
