-- Diagnostico seguro para erro 403 em /api/pet-clients.
-- Substitua os placeholders antes de rodar no Supabase SQL Editor.
-- Este arquivo apenas consulta dados; nao altera nenhuma tabela.

-- 1. Verifique o profile do admin Pet Shop.
select
  p.id,
  p.email,
  p.system_type as profile_system_type,
  p.tenant_id,
  p.primary_tenant_id,
  t.system_type as tenant_system_type,
  t.mode as tenant_mode
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.email = 'EMAIL_DO_ADMIN_PETSHOP';

-- 2. Com o id retornado acima, verifique todos os vinculos tenant/filial.
select
  tm.user_profile_id,
  tm.tenant_id,
  tm.branch_id,
  tm.role,
  t.name as tenant_name,
  t.system_type as tenant_system_type,
  t.mode as tenant_mode,
  b.name as branch_name,
  b.is_active
from public.tenant_members tm
join public.tenants t on t.id = tm.tenant_id
left join public.branches b on b.id = tm.branch_id
where tm.user_profile_id = 'ID_DO_PROFILE'
order by tm.created_at asc, tm.id asc;

-- 3. Liste filiais reais ativas disponiveis para o Dev/SuperAdmin abrir.
select
  b.id as branch_id,
  b.name as branch_name,
  t.id as tenant_id,
  t.name as tenant_name,
  t.system_type,
  t.mode
from public.branches b
join public.tenants t on t.id = b.tenant_id
where b.is_active = true
order by t.system_type, t.name, b.is_default desc, b.created_at asc;

-- 4. Se um tenant foi criado como padrao mas deveria ser petshop, corrija
-- somente depois de confirmar manualmente o tenant correto. Exemplo:
-- update public.tenants
-- set system_type = 'petshop', mode = 'petshop'
-- where id = 'TENANT_ID_CONFIRMADO';
--
-- update public.profiles
-- set system_type = 'petshop',
--     tenant_id = 'TENANT_ID_CONFIRMADO',
--     primary_tenant_id = 'TENANT_ID_CONFIRMADO'
-- where id = 'PROFILE_ID_CONFIRMADO';
