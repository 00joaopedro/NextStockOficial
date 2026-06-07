-- Agenda Pet production readiness audit.
-- Read-only diagnostics. Do not add UPDATE, DELETE, ALTER or DROP here.

-- 1. agenda_pets without tenant.
select id, "tenantId", branch_id, client_id, pet_id, cliente, animal
from public.agenda_pets
where "tenantId" is null;

-- 2. agenda_pets without branch.
select id, "tenantId", branch_id, client_id, pet_id, cliente, animal
from public.agenda_pets
where branch_id is null;

-- 3. agenda_pets whose branch belongs to a different tenant.
select
  a.id,
  a."tenantId" as agenda_tenant_id,
  a.branch_id,
  b.tenant_id as branch_tenant_id
from public.agenda_pets a
left join public.branches b on b.id = a.branch_id
where a.branch_id is not null
  and (b.id is null or b.tenant_id <> a."tenantId");

-- 4. agenda_pets whose client belongs to a different tenant/branch.
select
  a.id,
  a."tenantId" as agenda_tenant_id,
  a.branch_id as agenda_branch_id,
  a.client_id,
  c.tenant_id as client_tenant_id,
  c.branch_id as client_branch_id
from public.agenda_pets a
join public.pet_clients c on c.id = a.client_id
where c.tenant_id <> a."tenantId"
   or c.branch_id is distinct from a.branch_id;

-- 5. agenda_pets whose pet belongs to a different tenant/branch.
select
  a.id,
  a."tenantId" as agenda_tenant_id,
  a.branch_id as agenda_branch_id,
  a.pet_id,
  p.tenant_id as pet_tenant_id,
  p.branch_id as pet_branch_id
from public.agenda_pets a
join public.pets p on p.id = a.pet_id
where p.tenant_id <> a."tenantId"
   or p.branch_id is distinct from a.branch_id;

-- 6. agenda_pets whose pet does not belong to the selected client.
select
  a.id,
  a.client_id,
  a.pet_id,
  p.client_id as pet_client_id
from public.agenda_pets a
join public.pets p on p.id = a.pet_id
where a.client_id is not null
  and p.client_id <> a.client_id;

-- 7. records without both legacy date/hour and production start/end.
select id, "tenantId", branch_id, data, hora, start_at, end_at
from public.agenda_pets
where (data is null or hora is null or trim(hora) = '')
  and (start_at is null or end_at is null);

-- 8. invalid production intervals.
select id, "tenantId", branch_id, start_at, end_at
from public.agenda_pets
where start_at is not null
  and end_at is not null
  and end_at <= start_at;

-- 9. Invalid statuses, including legacy DBs where status is still text.
select id, status
from public.agenda_pets
where status::text not in (
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'canceled',
  'no_show'
);

-- 10. Active time conflicts by branch and pet.
select
  a.id as agenda_a_id,
  b.id as agenda_b_id,
  a."tenantId",
  a.branch_id,
  a.pet_id,
  a.start_at as agenda_a_start,
  a.end_at as agenda_a_end,
  b.start_at as agenda_b_start,
  b.end_at as agenda_b_end
from public.agenda_pets a
join public.agenda_pets b
  on b.id <> a.id
 and b."tenantId" = a."tenantId"
 and b.branch_id is not distinct from a.branch_id
 and b.pet_id = a.pet_id
 and b.deleted_at is null
 and b.status::text not in ('canceled', 'completed', 'no_show')
 and b.start_at < a.end_at
 and b.end_at > a.start_at
where a.deleted_at is null
  and a.status::text not in ('canceled', 'completed', 'no_show')
  and a.start_at is not null
  and a.end_at is not null
  and a.id < b.id;

-- 11. Constraints on agenda_pets and validation state.
select conname, contype, convalidated
from pg_constraint
where conrelid = 'public.agenda_pets'::regclass
order by conname;

-- 12. Current agenda_pets columns.
select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'agenda_pets'
order by ordinal_position;

-- 13. Agenda data inside non-Pet Shop tenants.
select
  a.id,
  a."tenantId",
  t.name as tenant_name,
  t.system_type
from public.agenda_pets a
join public.tenants t on t.id = a."tenantId"
where t.system_type <> 'petshop';

-- 14. Orphaned records.
select a.id, a."tenantId", a.branch_id, a.client_id, a.pet_id
from public.agenda_pets a
left join public.tenants t on t.id = a."tenantId"
left join public.branches b on b.id = a.branch_id
left join public.pet_clients c on c.id = a.client_id
left join public.pets p on p.id = a.pet_id
where t.id is null
   or (a.branch_id is not null and b.id is null)
   or (a.client_id is not null and c.id is null)
   or (a.pet_id is not null and p.id is null);

-- 15. creator/updater/canceler references that do not exist.
select a.id, a.created_by_id, a.updated_by_id, a.canceled_by_id
from public.agenda_pets a
left join public.profiles created_by on created_by.id = a.created_by_id
left join public.profiles updated_by on updated_by.id = a.updated_by_id
left join public.profiles canceled_by on canceled_by.id = a.canceled_by_id
where (a.created_by_id is not null and created_by.id is null)
   or (a.updated_by_id is not null and updated_by.id is null)
   or (a.canceled_by_id is not null and canceled_by.id is null);
