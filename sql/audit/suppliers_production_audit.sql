-- NextStock suppliers production audit.
-- Safe diagnostics only: SELECT statements, no writes.

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('suppliers', 'products', 'tenants', 'branches')
order by table_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('suppliers', 'products')
order by table_name, ordinal_position;

select
  indexname,
  tablename,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('suppliers', 'products')
order by tablename, indexname;

select
  conname,
  conrelid::regclass as table_name,
  contype,
  convalidated
from pg_constraint
where conrelid::regclass::text in ('suppliers', 'products')
order by table_name, conname;

select
  id,
  tenant_id,
  branch_id,
  name,
  supplier,
  created_at
from public.products
where supplier is not null
  and trim(supplier) <> ''
order by created_at desc
limit 100;

select
  tenant_id,
  branch_id,
  lower(trim(supplier)) as supplier_name,
  count(*) as product_count
from public.products
where supplier is not null
  and trim(supplier) <> ''
group by tenant_id, branch_id, lower(trim(supplier))
order by product_count desc;

select
  id,
  name,
  tenant_id,
  branch_id,
  supplier
from public.products
where branch_id is null
   or tenant_id is null
order by created_at desc;

select
  id,
  legal_name,
  document,
  tenant_id,
  branch_id,
  status,
  deleted_at
from public.suppliers
where tenant_id is null
   or branch_id is null;

select
  s.id,
  s.legal_name,
  s.tenant_id as supplier_tenant_id,
  s.branch_id,
  b.tenant_id as branch_tenant_id
from public.suppliers s
join public.branches b on b.id = s.branch_id
where b.tenant_id <> s.tenant_id;

select
  tenant_id,
  branch_id,
  document,
  count(*) as total
from public.suppliers
where deleted_at is null
  and coalesce(document, '') <> ''
group by tenant_id, branch_id, document
having count(*) > 1;

select
  id,
  legal_name,
  status,
  deleted_at
from public.suppliers
where status not in ('active', 'inactive', 'blocked');

select
  id,
  legal_name,
  status,
  deleted_at
from public.suppliers
where deleted_at is not null
  and status = 'active';

select
  s.id,
  s.legal_name,
  s.tenant_id,
  s.branch_id,
  t.system_type,
  t.mode
from public.suppliers s
join public.tenants t on t.id = s.tenant_id
order by s.created_at desc
limit 100;

select
  id,
  legal_name,
  person_type,
  document,
  phone
from public.suppliers
where legal_name is null
   or trim(legal_name) = ''
   or person_type is null
   or document is null
   or trim(document) = ''
   or phone is null
   or trim(phone) = '';
