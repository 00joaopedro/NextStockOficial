-- Read-only multi-tenant integrity audit. This script performs no updates.

SELECT p.id, p.email, p.tenant_id, p.primary_tenant_id, tm.tenant_id AS membership_tenant_id
FROM profiles p
LEFT JOIN tenant_members tm ON tm.user_profile_id = p.id
WHERE p.tenant_id IS DISTINCT FROM p.primary_tenant_id
   OR (tm.tenant_id IS NOT NULL AND tm.tenant_id IS DISTINCT FROM p.tenant_id);

SELECT tm.id, tm.user_profile_id, tm.tenant_id, tm.branch_id, b.tenant_id AS branch_tenant_id
FROM tenant_members tm
JOIN branches b ON b.id = tm.branch_id
WHERE tm.tenant_id IS DISTINCT FROM b.tenant_id;

SELECT pc.id, pc.tenant_id, pc.branch_id, b.tenant_id AS branch_tenant_id
FROM pet_clients pc
JOIN branches b ON b.id = pc.branch_id
WHERE pc.tenant_id IS DISTINCT FROM b.tenant_id;

SELECT p.id, p.tenant_id, p.branch_id, p.client_id,
       pc.tenant_id AS client_tenant_id, pc.branch_id AS client_branch_id
FROM pets p
JOIN pet_clients pc ON pc.id = p.client_id
WHERE p.tenant_id IS DISTINCT FROM pc.tenant_id
   OR p.branch_id IS DISTINCT FROM pc.branch_id;

SELECT pp.id, pp.tenant_id, pp.branch_id, pp.pet_id,
       p.tenant_id AS pet_tenant_id, p.branch_id AS pet_branch_id
FROM pet_photos pp
JOIN pets p ON p.id = pp.pet_id
WHERE pp.tenant_id IS DISTINCT FROM p.tenant_id
   OR pp.branch_id IS DISTINCT FROM p.branch_id;

SELECT a.id, a."tenantId", a.branch_id, a.client_id, a.pet_id,
       pc.tenant_id AS client_tenant_id, pc.branch_id AS client_branch_id,
       p.tenant_id AS pet_tenant_id, p.branch_id AS pet_branch_id
FROM agenda_pets a
LEFT JOIN pet_clients pc ON pc.id = a.client_id
LEFT JOIN pets p ON p.id = a.pet_id
WHERE (pc.id IS NOT NULL AND (
         a."tenantId" IS DISTINCT FROM pc.tenant_id
         OR a.branch_id IS DISTINCT FROM pc.branch_id
      ))
   OR (p.id IS NOT NULL AND (
         a."tenantId" IS DISTINCT FROM p.tenant_id
         OR a.branch_id IS DISTINCT FROM p.branch_id
      ));

SELECT 'products' AS source, id FROM products WHERE tenant_id IS NULL
UNION ALL SELECT 'payment_machines', id FROM payment_machines WHERE tenant_id IS NULL
UNION ALL SELECT 'pet_clients', id FROM pet_clients WHERE tenant_id IS NULL
UNION ALL SELECT 'pets', id FROM pets WHERE tenant_id IS NULL
UNION ALL SELECT 'pet_photos', id FROM pet_photos WHERE tenant_id IS NULL;

SELECT id, name, system_type, mode
FROM tenants
WHERE (system_type = 'padrao' AND mode = 'petshop')
   OR system_type IS NULL
   OR mode IS NULL;

-- Review every superAdmin linked to the shared Dev tenant. Compare this result
-- with DEV_SUPER_ADMIN_EMAILS/DEV_SUPER_ADMIN_USER_IDS before changing data.
SELECT p.id, p.email, p.role, p.is_super_admin, tm.tenant_id, t.slug AS tenant_slug
FROM profiles p
JOIN tenant_members tm ON tm.user_profile_id = p.id
JOIN tenants t ON t.id = tm.tenant_id
WHERE t.slug = 'nextstock-dev'
  AND (p.role = 'superAdmin' OR p.is_super_admin = true);
