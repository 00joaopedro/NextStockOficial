-- NextStock profile, billing and payment-machine audit.
-- Read-only diagnostics: SELECT statements only.

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'tenants',
    'profiles',
    'plans',
    'subscriptions',
    'payment_machines',
    'company_fiscal_configs'
  )
ORDER BY table_name, ordinal_position;

SELECT id, name, cnpj, contact_email, contact_phone, current_plan_id, mode, system_type
FROM public.tenants
WHERE name IS NULL
   OR btrim(name) = ''
   OR cnpj IS NULL
   OR contact_email IS NULL
   OR contact_phone IS NULL;

SELECT id, name, cnpj
FROM public.tenants
WHERE cnpj IS NOT NULL
  AND (
    length(regexp_replace(cnpj, '\D', '', 'g')) <> 14
    OR regexp_replace(cnpj, '\D', '', 'g') ~ '^(\d)\1{13}$'
  );

SELECT regexp_replace(cnpj, '\D', '', 'g') AS normalized_cnpj, count(*) AS total
FROM public.tenants
WHERE cnpj IS NOT NULL
GROUP BY regexp_replace(cnpj, '\D', '', 'g')
HAVING count(*) > 1;

SELECT id, email, tenant_id, primary_tenant_id
FROM public.profiles
WHERE tenant_id IS NULL
   OR primary_tenant_id IS NULL
   OR tenant_id IS DISTINCT FROM primary_tenant_id;

SELECT p.id, p.name, p.slug, p.price_cents, p.is_active,
       count(t.id) AS legacy_assigned_tenants,
       count(s.id) FILTER (
         WHERE s.status::text IN ('trialing', 'active', 'past_due')
       ) AS effective_subscriptions
FROM public.plans p
LEFT JOIN public.tenants t ON t.current_plan_id = p.id
LEFT JOIN public.subscriptions s ON s.plan_id = p.id
GROUP BY p.id, p.name, p.slug, p.price_cents, p.is_active
ORDER BY p.price_cents;

SELECT t.id, t.name, t.current_plan_id
FROM public.tenants t
LEFT JOIN public.plans p ON p.id = t.current_plan_id
WHERE t.current_plan_id IS NULL
   OR p.id IS NULL
   OR p.is_active = false;

SELECT tenant_id, count(*) AS effective_subscriptions
FROM public.subscriptions
WHERE status::text IN ('trialing', 'active', 'past_due')
GROUP BY tenant_id
HAVING count(*) > 1;

SELECT pm.id, pm.tenant_id, pm.branch_id, pm.name, pm.provider, pm.status
FROM public.payment_machines pm
LEFT JOIN public.branches b ON b.id = pm.branch_id
WHERE pm.tenant_id IS NULL
   OR pm.branch_id IS NULL
   OR b.id IS NULL
   OR b.tenant_id IS DISTINCT FROM pm.tenant_id;

SELECT tenant_id, branch_id, lower(btrim(name)) AS normalized_name,
       provider, lower(btrim(model)) AS normalized_model, count(*) AS total
FROM public.payment_machines
WHERE deleted_at IS NULL
GROUP BY tenant_id, branch_id, lower(btrim(name)), provider, lower(btrim(model))
HAVING count(*) > 1;

SELECT external_provider, external_reference, count(*) AS total
FROM public.payment_machines
WHERE deleted_at IS NULL
  AND external_provider IS NOT NULL
  AND external_reference IS NOT NULL
GROUP BY external_provider, external_reference
HAVING count(*) > 1;

SELECT id, tenant_id, branch_id, name, provider, status, fee_percent
FROM public.payment_machines
WHERE provider::text NOT IN ('stone', 'pagseguro', 'mercado_pago', 'outro')
   OR status::text NOT IN ('ativa', 'inativa', 'manutencao')
   OR fee_percent < 0
   OR fee_percent > 100;

SELECT b.id AS branch_id, b.tenant_id, b.name AS branch_name
FROM public.branches b
LEFT JOIN public.company_fiscal_configs c
  ON c.tenant_id = b.tenant_id
 AND c.branch_id = b.id
WHERE b.is_active = true
  AND c.id IS NULL;

SELECT conrelid::regclass AS table_name, conname, contype, convalidated,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.tenants'::regclass,
  'public.profiles'::regclass,
  'public.plans'::regclass,
  'public.subscriptions'::regclass,
  'public.payment_machines'::regclass,
  'public.company_fiscal_configs'::regclass
)
ORDER BY table_name, conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants',
    'profiles',
    'plans',
    'subscriptions',
    'payment_machines',
    'company_fiscal_configs'
  )
ORDER BY tablename, indexname;

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants',
    'profiles',
    'plans',
    'subscriptions',
    'payment_machines',
    'company_fiscal_configs'
  )
ORDER BY tablename, policyname;
