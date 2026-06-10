-- NextStock employees production audit.
-- Safe diagnostics only: SELECT statements, no writes.

select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('employees', 'profiles', 'tenant_members', 'tenants', 'branches')
order by table_name;

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('employees', 'profiles', 'tenant_members')
order by table_name, ordinal_position;

select
  p.id,
  p.email,
  p.role,
  p.tenant_id,
  p.primary_tenant_id,
  p.supabase_user_id
from public.profiles p
where p.supabase_user_id is null
  and coalesce(p.is_super_admin, false) = false
order by p.created_at desc;

select
  p.email,
  count(*) as total
from public.profiles p
group by p.email
having count(*) > 1;

select
  p.id,
  p.email,
  p.tenant_id,
  p.primary_tenant_id
from public.profiles p
where p.tenant_id is null
   or p.primary_tenant_id is null;

select
  p.id,
  p.email,
  p.tenant_id,
  p.primary_tenant_id
from public.profiles p
where p.tenant_id is distinct from p.primary_tenant_id;

select
  tm.id,
  tm.user_profile_id,
  p.email,
  tm.tenant_id,
  tm.branch_id,
  tm.role
from public.tenant_members tm
join public.profiles p on p.id = tm.user_profile_id
where tm.branch_id is null;

select
  tm.id,
  tm.user_profile_id,
  p.email,
  tm.tenant_id as membership_tenant_id,
  tm.branch_id,
  b.tenant_id as branch_tenant_id
from public.tenant_members tm
join public.profiles p on p.id = tm.user_profile_id
join public.branches b on b.id = tm.branch_id
where b.tenant_id <> tm.tenant_id;

select
  p.id,
  p.email,
  p.role,
  p.is_super_admin,
  p.allowed_system_types
from public.profiles p
where p.is_super_admin = true
   or p.role = 'superAdmin';

select
  p.id,
  p.email,
  p.system_type as profile_system_type,
  t.system_type as tenant_system_type,
  p.allowed_system_types
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.system_type is not null
  and t.system_type is not null
  and p.system_type <> t.system_type;

select
  p.id,
  p.email
from public.profiles p
left join public.tenant_members tm on tm.user_profile_id = p.id
where tm.id is null
  and coalesce(p.is_super_admin, false) = false;

select
  e.id,
  e.profile_id,
  e.email,
  e.tenant_id,
  e.branch_id
from public.employees e
left join public.profiles p on p.id = e.profile_id
where p.id is null;

select
  e.id,
  e.email,
  e.tenant_id,
  e.branch_id
from public.employees e
where e.tenant_id is null
   or e.branch_id is null;

select
  e.id,
  e.email,
  e.tenant_id as employee_tenant_id,
  e.branch_id as employee_branch_id,
  p.tenant_id as profile_tenant_id,
  tm.tenant_id as membership_tenant_id,
  tm.branch_id as membership_branch_id
from public.employees e
join public.profiles p on p.id = e.profile_id
left join public.tenant_members tm
  on tm.user_profile_id = e.profile_id
 and tm.tenant_id = e.tenant_id
 and tm.branch_id = e.branch_id
where p.tenant_id is distinct from e.tenant_id
   or tm.id is null;

select
  e.id,
  e.email,
  e.status,
  e.dismissal_date,
  e.deleted_at,
  tm.id as membership_id
from public.employees e
left join public.tenant_members tm
  on tm.user_profile_id = e.profile_id
 and tm.tenant_id = e.tenant_id
 and tm.branch_id = e.branch_id
where e.status in ('inactive', 'dismissed')
   or e.dismissal_date <= now()
   or e.deleted_at is not null;

select
  e.id,
  e.email,
  e.employee_role,
  p.role as rbac_role
from public.employees e
join public.profiles p on p.id = e.profile_id
where (e.employee_role = 'admin' and p.role <> 'Admin')
   or (e.employee_role in ('gerente', 'caixa') and p.role <> 'Vendedor')
   or (e.employee_role in ('funcionario', 'estoque') and p.role <> 'Comprador');

select
  conname,
  conrelid::regclass as table_name,
  contype,
  convalidated
from pg_constraint
where conrelid::regclass::text in ('employees', 'profiles', 'tenant_members')
order by table_name, conname;
