-- NextStock - auditoria segura de despesas.
-- Somente SELECTs. Nao execute updates/deletes/alters a partir deste arquivo.

select table_schema, table_name
from information_schema.tables
where table_schema in ('public', 'storage')
  and table_name in ('expenses', 'expense_items', 'expense_files', 'suppliers', 'products', 'objects')
order by table_schema, table_name;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('expenses', 'expense_items', 'expense_files', 'suppliers', 'products')
order by table_name, ordinal_position;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('expenses', 'expense_items', 'expense_files')
order by tablename, indexname;

select
  conrelid::regclass as table_name,
  conname,
  contype,
  convalidated
from pg_constraint
where conrelid::regclass::text in ('expenses', 'expense_items', 'expense_files')
order by table_name, conname;

select id, tenant_id, branch_id, type, status, total_cents, date
from expenses
where tenant_id is null;

select id, tenant_id, branch_id, type, status, total_cents, date
from expenses
where branch_id is null;

select
  e.id,
  e.tenant_id,
  e.branch_id,
  b.tenant_id as branch_tenant_id
from expenses e
left join branches b on b.id = e.branch_id
where b.id is null
   or b.tenant_id <> e.tenant_id;

select i.*
from expense_items i
left join expenses e on e.id = i.expense_id
where e.id is null;

select f.*
from expense_files f
left join expenses e on e.id = f.expense_id
where e.id is null;

select id, expense_id, file_name, storage_path, file_url
from expense_files
where coalesce(storage_path, '') = ''
  and coalesce(file_url, '') = '';

select id, type, status, deleted_at
from expenses
where deleted_at is not null
  and status not in ('canceled');

select
  e.id,
  e.total_cents,
  coalesce(sum(i.total_cost_cents), 0) as items_total_cents
from expenses e
left join expense_items i on i.expense_id = e.id
where e.type = 'written'
group by e.id, e.total_cents
having e.total_cents <> coalesce(sum(i.total_cost_cents), 0);

select
  e.id,
  e.supplier_id,
  e.tenant_id,
  e.branch_id,
  s.tenant_id as supplier_tenant_id,
  s.branch_id as supplier_branch_id,
  s.status as supplier_status
from expenses e
left join suppliers s on s.id = e.supplier_id
where e.supplier_id is not null
  and (
    s.id is null
    or s.tenant_id <> e.tenant_id
    or s.branch_id <> e.branch_id
    or s.deleted_at is not null
  );

select
  i.id,
  i.expense_id,
  i.product_id,
  e.tenant_id as expense_tenant_id,
  e.branch_id as expense_branch_id,
  p.tenant_id as product_tenant_id,
  p.branch_id as product_branch_id
from expense_items i
join expenses e on e.id = i.expense_id
left join products p on p.id = i.product_id
where i.product_id is not null
  and (
    p.id is null
    or p.tenant_id <> e.tenant_id
    or p.branch_id <> e.branch_id
  );

select
  f.id,
  f.expense_id,
  f.tenant_id,
  f.branch_id,
  e.tenant_id as expense_tenant_id,
  e.branch_id as expense_branch_id
from expense_files f
left join expenses e on e.id = f.expense_id
where e.id is null
   or f.tenant_id <> e.tenant_id
   or f.branch_id <> e.branch_id;

select bucket_id, name, created_at, updated_at
from storage.objects
where bucket_id = 'expense-files'
order by created_at desc
limit 100;
