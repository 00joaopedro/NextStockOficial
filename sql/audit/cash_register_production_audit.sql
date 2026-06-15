-- NextStock PDV/cash-register production audit.
-- Read-only diagnostics: SELECT statements only.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents',
    'products',
    'payment_machines'
  )
ORDER BY table_name;

SELECT table_name, ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents',
    'products',
    'payment_machines'
  )
ORDER BY table_name, ordinal_position;

SELECT s.id, s.tenant_id, s.branch_id, s.sold_at
FROM sales s
WHERE s.tenant_id IS NULL OR s.branch_id IS NULL;

SELECT s.id, s.tenant_id, s.branch_id, b.tenant_id AS branch_tenant_id
FROM sales s
LEFT JOIN branches b ON b.id = s.branch_id
WHERE b.id IS NULL OR b.tenant_id <> s.tenant_id;

SELECT si.*
FROM sale_items si
LEFT JOIN sales s ON s.id = si.sale_id
WHERE s.id IS NULL;

SELECT sp.*
FROM sale_payments sp
LEFT JOIN sales s ON s.id = sp.sale_id
WHERE s.id IS NULL;

SELECT
  s.id,
  s.subtotal_cents,
  s.discount_cents,
  s.total_cents,
  COALESCE(SUM(si.total_price_cents), 0) AS items_total_cents
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
GROUP BY s.id, s.subtotal_cents, s.discount_cents, s.total_cents
HAVING s.subtotal_cents <> COALESCE(SUM(si.total_price_cents), 0)
   OR s.total_cents <> s.subtotal_cents - s.discount_cents;

SELECT
  s.id,
  s.total_cents,
  s.paid_cents,
  s.change_cents,
  COALESCE(
    SUM(sp.amount_cents) FILTER (WHERE sp.status = 'approved'),
    0
  ) AS approved_amount_cents
FROM sales s
LEFT JOIN sale_payments sp ON sp.sale_id = s.id
WHERE s.status = 'paid'
GROUP BY s.id, s.total_cents, s.paid_cents, s.change_cents
HAVING COALESCE(
         SUM(sp.amount_cents) FILTER (WHERE sp.status = 'approved'),
         0
       ) < s.total_cents
    OR (s.paid_cents IS NOT NULL AND s.paid_cents < s.total_cents)
    OR (s.paid_cents IS NOT NULL
        AND s.change_cents <> s.paid_cents - s.total_cents);

SELECT id, tenant_id, branch_id, name, barcode, sku
FROM products
WHERE barcode IS NULL OR btrim(barcode) = '';

SELECT id, tenant_id, branch_id, name, quantity
FROM products
WHERE quantity < 0;

SELECT id, tenant_id, branch_id, name, sale_price_cents
FROM products
WHERE sale_price_cents IS NULL OR sale_price_cents <= 0;

SELECT
  sp.id AS payment_id,
  sp.sale_id,
  sp.payment_machine_id,
  pm.status,
  pm.deleted_at
FROM sale_payments sp
JOIN payment_machines pm ON pm.id = sp.payment_machine_id
WHERE pm.status <> 'ativa' OR pm.deleted_at IS NOT NULL;

SELECT
  tenant_id,
  branch_id,
  idempotency_key,
  COUNT(*) AS duplicate_count
FROM sales
WHERE idempotency_key IS NOT NULL
GROUP BY tenant_id, branch_id, idempotency_key
HAVING COUNT(*) > 1;

SELECT
  s.id AS sale_id,
  si.product_id,
  s.tenant_id AS sale_tenant_id,
  s.branch_id AS sale_branch_id,
  p.tenant_id AS product_tenant_id,
  p.branch_id AS product_branch_id
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.id = si.product_id
WHERE p.tenant_id <> s.tenant_id
   OR p.branch_id IS DISTINCT FROM s.branch_id;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'sales',
    'sale_items',
    'sale_payments',
    'sale_documents',
    'products',
    'payment_machines'
  )
ORDER BY tablename, policyname;

SELECT
  conrelid::regclass AS table_name,
  conname,
  contype,
  convalidated
FROM pg_constraint
WHERE conrelid IN (
  'sales'::regclass,
  'sale_items'::regclass,
  'sale_payments'::regclass,
  'sale_documents'::regclass,
  'products'::regclass,
  'payment_machines'::regclass
)
ORDER BY table_name, conname;
