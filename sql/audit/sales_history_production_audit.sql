SELECT
  to_regclass('public.sales') AS sales,
  to_regclass('public.sale_items') AS sale_items,
  to_regclass('public.sale_payments') AS sale_payments,
  to_regclass('public.sale_documents') AS sale_documents;

SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'orders',
    'order_items',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents'
  )
ORDER BY table_name, ordinal_position;

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'orders',
    'order_items',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents'
  )
ORDER BY tablename, indexname;

SELECT
  conrelid::regclass AS table_name,
  conname AS constraint_name,
  contype AS constraint_type,
  convalidated AS validated,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid IN (
    'public.sales'::regclass,
    'public.sale_items'::regclass,
    'public.sale_payments'::regclass,
    'public.sale_documents'::regclass
  )
ORDER BY conrelid::regclass::text, conname;

SELECT s.*
FROM public.sales s
WHERE s.tenant_id IS NULL
   OR s.branch_id IS NULL;

SELECT
  s.id AS sale_id,
  s.tenant_id AS sale_tenant_id,
  s.branch_id,
  b.tenant_id AS branch_tenant_id
FROM public.sales s
LEFT JOIN public.branches b ON b.id = s.branch_id
WHERE b.id IS NULL
   OR b.tenant_id IS DISTINCT FROM s.tenant_id;

SELECT si.*
FROM public.sale_items si
LEFT JOIN public.sales s ON s.id = si.sale_id
WHERE s.id IS NULL;

SELECT sp.*
FROM public.sale_payments sp
LEFT JOIN public.sales s ON s.id = sp.sale_id
WHERE s.id IS NULL;

SELECT sd.*
FROM public.sale_documents sd
LEFT JOIN public.sales s ON s.id = sd.sale_id
WHERE s.id IS NULL;

SELECT
  s.id,
  s.subtotal_cents,
  COALESCE(SUM(si.total_price_cents), 0) AS item_total_cents,
  s.discount_cents,
  s.total_cents
FROM public.sales s
LEFT JOIN public.sale_items si ON si.sale_id = s.id
GROUP BY s.id, s.subtotal_cents, s.discount_cents, s.total_cents
HAVING s.subtotal_cents <> COALESCE(SUM(si.total_price_cents), 0)
    OR s.total_cents <> s.subtotal_cents - s.discount_cents;

SELECT
  s.id,
  s.status,
  s.canceled_at,
  s.cancellation_reason
FROM public.sales s
WHERE s.status = 'canceled'
  AND s.canceled_at IS NULL;

SELECT
  sd.id,
  sd.sale_id,
  sd.type,
  sd.status,
  sd.access_key,
  sd.xml_path,
  sd.pdf_path
FROM public.sale_documents sd
WHERE sd.type IN ('nfce65', 'nfe55')
  AND (
    sd.status IS NULL
    OR (sd.status = 'authorized' AND sd.access_key IS NULL)
    OR (sd.status = 'authorized' AND sd.xml_path IS NULL AND sd.pdf_path IS NULL)
  );

SELECT
  o.id AS order_id,
  o.tenant_id,
  o.branch_id,
  o.status,
  o.updated_at
FROM public.orders o
LEFT JOIN public.sales s ON s.order_id = o.id AND s.deleted_at IS NULL
WHERE o.deleted_at IS NULL
  AND o.status IN ('paid', 'delivered')
  AND s.id IS NULL
ORDER BY o.updated_at DESC;

SELECT
  s.id AS sale_id,
  s.tenant_id AS sale_tenant_id,
  s.branch_id AS sale_branch_id,
  si.id AS sale_item_id,
  p.id AS product_id,
  p.tenant_id AS product_tenant_id,
  p.branch_id AS product_branch_id
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id
LEFT JOIN public.products p ON p.id = si.product_id
WHERE si.product_id IS NOT NULL
  AND (
    p.id IS NULL
    OR p.tenant_id IS DISTINCT FROM s.tenant_id
    OR p.branch_id IS DISTINCT FROM s.branch_id
  );

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'orders',
    'order_items',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents'
  )
ORDER BY tablename;

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'orders',
    'order_items',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents'
  )
ORDER BY tablename, policyname;
