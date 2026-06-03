-- Diagnostico seguro para erro 403 em /api/pet-clients.
-- Fluxo principal de schema: `npm run db:migrate`.
-- Este arquivo apenas consulta dados; nao altera nenhuma tabela.
-- Substitua os placeholders antes de executar as consultas em ambiente controlado.

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

-- Se as consultas mostrarem inconsistencia de dados, prepare uma correcao
-- controlada e revisada. Alteracoes estruturais continuam obrigatoriamente em
-- prisma/migrations.
