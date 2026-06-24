-- NextStock Dashboard production audit
-- Safe diagnostic SELECTs only. No UPDATE/DELETE/ALTER/DROP.

SELECT tenant_id, branch_id, COUNT(*) AS total_vendas
FROM sales
GROUP BY tenant_id, branch_id
ORDER BY total_vendas DESC;

SELECT tenant_id, branch_id, COUNT(*) AS despesas_sem_data_ou_status
FROM expenses
WHERE date IS NULL OR status IS NULL
GROUP BY tenant_id, branch_id;

SELECT
  s.tenant_id,
  s.branch_id,
  si.product_id,
  COALESCE(MAX(si.product_name_snapshot), 'Produto sem nome') AS product_name,
  SUM(si.quantity) AS quantity_sold
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.deleted_at IS NULL
  AND s.status = 'paid'
GROUP BY s.tenant_id, s.branch_id, si.product_id
ORDER BY quantity_sold DESC
LIMIT 5;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('sales', 'sale_items', 'sale_payments', 'expenses', 'agenda_pets', 'products')
ORDER BY tablename, indexname;

SELECT id, tenant_id, branch_id, sold_at, status
FROM sales
WHERE tenant_id IS NULL OR branch_id IS NULL;

SELECT id, tenant_id, branch_id, date, status
FROM expenses
WHERE tenant_id IS NULL OR branch_id IS NULL;

SELECT id, "tenantId" AS tenant_id, branch_id, start_at, status
FROM agenda_pets
WHERE "tenantId" IS NULL OR branch_id IS NULL;

SELECT si.id, si.sale_id, si.product_id
FROM sale_items si
LEFT JOIN sales s ON s.id = si.sale_id
WHERE s.id IS NULL;

SELECT ei.id, ei.expense_id, ei.product_id
FROM expense_items ei
LEFT JOIN expenses e ON e.id = ei.expense_id
WHERE e.id IS NULL;

SELECT s.id, s.tenant_id, s.branch_id, s.status, s.sold_at
FROM sales s
WHERE s.status = 'paid'
  AND s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sale_payments sp
    WHERE sp.sale_id = s.id
      AND sp.status = 'approved'
  );

SELECT COUNT(*) AS sale_items_sem_cost_snapshot
FROM sale_items
WHERE unit_cost_cents_snapshot IS NULL
   OR total_cost_cents_snapshot IS NULL;

SELECT tenant_id, branch_id, COUNT(*) AS produtos_sem_custo
FROM products
WHERE cost_price_cents IS NULL OR cost_price_cents <= 0
GROUP BY tenant_id, branch_id;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('sales', 'sale_items', 'sale_payments', 'expenses', 'agenda_pets', 'products')
ORDER BY tablename, policyname;

SELECT 'expenses.due_date ausente no schema atual; dashboard usa expenses.date como vencimento temporario.' AS lacuna_due_date;
