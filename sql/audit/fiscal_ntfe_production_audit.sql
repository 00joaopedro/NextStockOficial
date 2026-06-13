SELECT
  to_regclass('public.sales') AS sales,
  to_regclass('public.sale_items') AS sale_items,
  to_regclass('public.sale_documents') AS sale_documents,
  to_regclass('public.company_fiscal_configs') AS company_fiscal_configs,
  to_regclass('public.fiscal_document_items') AS fiscal_document_items,
  to_regclass('public.fiscal_document_events') AS fiscal_document_events,
  to_regclass('public.fiscal_sequences') AS fiscal_sequences;

SELECT table_name, ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'orders',
    'sales',
    'sale_items',
    'sale_documents',
    'products',
    'company_fiscal_configs',
    'fiscal_document_items',
    'fiscal_document_events',
    'fiscal_sequences'
  )
ORDER BY table_name, ordinal_position;

SELECT sd.id, sd.sale_id, sd.tenant_id, sd.branch_id
FROM sale_documents sd
LEFT JOIN sales s ON s.id = sd.sale_id
WHERE s.id IS NULL;

SELECT s.id, s.order_id, s.tenant_id, s.branch_id,
       o.tenant_id AS order_tenant_id, o.branch_id AS order_branch_id
FROM sales s
JOIN orders o ON o.id = s.order_id
WHERE s.tenant_id <> o.tenant_id
   OR s.branch_id <> o.branch_id;

SELECT sd.id, sd.sale_id, sd.status, sd.access_key, sd.protocol,
       sd.xml_path, sd.pdf_path
FROM sale_documents sd
WHERE sd.status::text = 'authorized'
  AND (
    NULLIF(sd.access_key, '') IS NULL
    OR NULLIF(sd.protocol, '') IS NULL
    OR NULLIF(sd.xml_path, '') IS NULL
    OR NULLIF(sd.pdf_path, '') IS NULL
  );

SELECT sale_id, type, COUNT(*) AS active_documents
FROM sale_documents
WHERE type::text IN ('nfe55', 'nfce65')
  AND status::text <> 'canceled'
  AND deleted_at IS NULL
GROUP BY sale_id, type
HAVING COUNT(*) > 1;

SELECT tenant_id, branch_id, model, series, number, COUNT(*) AS duplicates
FROM sale_documents
WHERE number IS NOT NULL
GROUP BY tenant_id, branch_id, model, series, number
HAVING COUNT(*) > 1;

SELECT access_key, COUNT(*) AS duplicates
FROM sale_documents
WHERE NULLIF(access_key, '') IS NOT NULL
GROUP BY access_key
HAVING COUNT(*) > 1;

SELECT provider_ref, COUNT(*) AS duplicates
FROM sale_documents
WHERE NULLIF(provider_ref, '') IS NOT NULL
GROUP BY provider_ref
HAVING COUNT(*) > 1;

SELECT s.id, s.tenant_id, s.branch_id, s.order_id, s.sold_at
FROM sales s
LEFT JOIN sale_documents sd
  ON sd.sale_id = s.id
 AND sd.type::text = 'nfe55'
 AND sd.deleted_at IS NULL
WHERE s.status::text = 'paid'
  AND s.deleted_at IS NULL
  AND sd.id IS NULL;

SELECT o.id, o.tenant_id, o.branch_id, o.status, o.updated_at
FROM orders o
LEFT JOIN sales s ON s.order_id = o.id AND s.deleted_at IS NULL
WHERE o.status::text IN ('paid', 'delivered')
  AND o.deleted_at IS NULL
  AND s.id IS NULL;

SELECT id, tenant_id, branch_id, name, ncm, cfop_default, unit, origin
FROM products
WHERE NULLIF(regexp_replace(COALESCE(ncm, ''), '\D', '', 'g'), '') IS NULL
   OR NULLIF(regexp_replace(COALESCE(cfop_default, ''), '\D', '', 'g'), '') IS NULL
   OR NULLIF(unit, '') IS NULL
   OR NULLIF(origin, '') IS NULL;

SELECT id, sale_id, product_name_snapshot,
       ncm_snapshot, cfop_snapshot, unit_snapshot, origin_snapshot
FROM sale_items
WHERE NULLIF(ncm_snapshot, '') IS NULL
   OR NULLIF(cfop_snapshot, '') IS NULL
   OR NULLIF(unit_snapshot, '') IS NULL
   OR NULLIF(origin_snapshot, '') IS NULL;

SELECT sd.id, sd.sale_id, sd.tenant_id, sd.branch_id,
       s.tenant_id AS sale_tenant_id, s.branch_id AS sale_branch_id
FROM sale_documents sd
JOIN sales s ON s.id = sd.sale_id
WHERE sd.tenant_id IS DISTINCT FROM s.tenant_id
   OR sd.branch_id IS DISTINCT FROM s.branch_id;

SELECT c.id, c.tenant_id, c.branch_id, c.cnpj, c.state_registration,
       c.crt, c.city_code_ibge, c.state, c.environment, c.provider,
       c.certificate_secret_ref, c.certificate_expires_at
FROM company_fiscal_configs c
WHERE NULLIF(c.cnpj, '') IS NULL
   OR NULLIF(c.city_code_ibge, '') IS NULL
   OR NULLIF(c.state, '') IS NULL
   OR c.crt NOT BETWEEN 1 AND 3
   OR (c.provider <> 'mock' AND NULLIF(c.certificate_secret_ref, '') IS NULL);

SELECT con.conname, cls.relname AS table_name, con.convalidated
FROM pg_constraint con
JOIN pg_class cls ON cls.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relname IN (
    'sale_documents',
    'company_fiscal_configs',
    'fiscal_document_items',
    'fiscal_document_events',
    'fiscal_sequences'
  )
  AND con.convalidated = false;

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'sales',
    'sale_items',
    'sale_documents',
    'company_fiscal_configs',
    'fiscal_document_items',
    'fiscal_document_events',
    'fiscal_sequences'
  )
ORDER BY tablename;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'sales',
    'sale_items',
    'sale_documents',
    'company_fiscal_configs',
    'fiscal_document_items',
    'fiscal_document_events',
    'fiscal_sequences'
  )
ORDER BY tablename, policyname;

SELECT bucket_id, name, created_at, updated_at
FROM storage.objects
WHERE bucket_id IN ('sale-documents', 'fiscal-documents')
ORDER BY created_at DESC;
