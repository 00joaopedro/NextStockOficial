-- Run manually with representative IDs and dates in Supabase SQL Editor.
-- EXPLAIN ANALYZE executes SELECT statements; do not replace them with writes.

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, sale_price_cents, quantity, category, sku, barcode
FROM products
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND branch_id = '00000000-0000-0000-0000-000000000000'::uuid
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS)
WITH filtered_sales AS (
  SELECT id, total_cents
  FROM sales
  WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND branch_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND deleted_at IS NULL
    AND status = 'paid'
    AND sold_at >= DATE '2026-06-01'
    AND sold_at < DATE '2026-07-01'
),
filtered_costs AS (
  SELECT si.sale_id, SUM(si.total_cost_cents_snapshot) AS total_cost_cents
  FROM sale_items si
  INNER JOIN filtered_sales fs ON fs.id = si.sale_id
  WHERE si.total_cost_cents_snapshot IS NOT NULL
  GROUP BY si.sale_id
)
SELECT COALESCE(SUM(fs.total_cents), 0), COUNT(*),
       COALESCE(SUM(fc.total_cost_cents), 0)
FROM filtered_sales fs
LEFT JOIN filtered_costs fc ON fc.sale_id = fs.id;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, date, total_cents
FROM expenses
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND branch_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND deleted_at IS NULL
  AND status IN ('approved', 'paid')
  AND date >= DATE '2026-06-01'
  AND date < DATE '2026-07-01'
ORDER BY date DESC
LIMIT 20;

-- pg_trgm is intentionally measurement-only in this release. Enable/index it
-- only if this plan shows sequential scans at production-like cardinality:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name
FROM products
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND branch_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND lower(name) LIKE '%racao%'
LIMIT 20;
