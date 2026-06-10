-- NextStock orders production audit.
-- Read-only diagnostics only. Do not add UPDATE/DELETE/ALTER/DROP here.

select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('orders', 'order_items')
order by table_name;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders', 'order_items')
order by table_name, ordinal_position;

select tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.table_schema = tc.table_schema
 and kcu.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name in ('orders', 'order_items')
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('orders', 'order_items')
order by tablename, indexname;

select id, name, tenant_id, branch_id, quantity
from public.products
where branch_id is null
order by created_at desc
limit 100;

select id, name, tenant_id, branch_id, quantity
from public.products
where quantity < 0
order by created_at desc
limit 100;

select id, tenant_id, branch_id, customer_name, created_at
from public.orders
where tenant_id is null
   or branch_id is null
order by created_at desc
limit 100;

select oi.id, oi.order_id
from public.order_items oi
left join public.orders o on o.id = oi.order_id
where o.id is null
limit 100;

select oi.id, oi.product_id
from public.order_items oi
left join public.products p on p.id = oi.product_id
where p.id is null
limit 100;

select o.id as order_id, o.tenant_id as order_tenant_id, p.tenant_id as product_tenant_id,
       o.branch_id as order_branch_id, p.branch_id as product_branch_id
from public.orders o
join public.order_items oi on oi.order_id = o.id
join public.products p on p.id = oi.product_id
where o.tenant_id <> p.tenant_id
   or o.branch_id <> p.branch_id
limit 100;

select id, status
from public.orders
where status::text not in ('pending', 'paid', 'preparing', 'delivered', 'canceled', 'refunded')
limit 100;

select id, status, delivered_at
from public.orders
where status = 'delivered'
  and delivered_at is null
limit 100;

select id, status, canceled_at
from public.orders
where status = 'canceled'
  and canceled_at is null
limit 100;

select o.id, o.subtotal_cents, coalesce(sum(oi.total_price_cents), 0) as items_total_cents
from public.orders o
left join public.order_items oi on oi.order_id = o.id
group by o.id, o.subtotal_cents
having o.subtotal_cents <> coalesce(sum(oi.total_price_cents), 0)
limit 100;
