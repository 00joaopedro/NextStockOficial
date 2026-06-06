# Deploy NextStock

Este projeto usa Prisma Migrate como fonte oficial de alteracoes de banco.

## Variaveis obrigatorias para banco

Configure no Railway:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
```

- `DATABASE_URL`: conexao runtime pela Supabase Transaction Pooler, porta `6543`.
- `pgbouncer=true`: impede prepared statements incompativeis com Transaction Pooler.
- `connection_limit=1`: limita o pool interno do Prisma por instancia.
- `DIRECT_URL`: conexao do Prisma CLI para migrations. Sem plano Pro/IPv4 Add-On, use preferencialmente a Supabase Session Pooler na porta `5432`.

Ambas devem apontar para o mesmo projeto Supabase do ambiente. Copie os hosts/usuarios exatos exibidos em `Connect` no dashboard Supabase.

O runtime normaliza automaticamente URLs `:6543` para garantir os parametros PgBouncer. Mesmo assim, configure a URL completa no Railway para deixar a infraestrutura explicita.

## Scripts importantes

```bash
npm run build
npm run start:prod
npm run start:railway
npm run db:migrate
```

## Multi-tenant security migrations

Before deploying a version that contains multi-tenant hardening migrations:

1. Run the read-only audit at `prisma/audit/multitenant_integrity_audit.sql`.
2. Review legacy rows reported by the audit. Do not mass-update tenants or branches.
3. Run `npm run db:migrate` from an environment connected to the intended Supabase project.
4. Confirm the new constraints and RLS policies before releasing the backend.

The hardening foreign keys are created as `NOT VALID`: they protect new writes without
silently modifying legacy data. Validate each constraint only after the audit findings
have been corrected explicitly.

The RLS migration denies direct public-table access by default and grants an explicit
policy only to Supabase `service_role`. Prisma query scoping remains the primary
security boundary; confirm that the runtime database role can operate as expected in a
staging environment before applying RLS in production.

`start:prod` deve continuar apenas iniciando o backend:

```bash
node dist/src/main.js
```

Nao acople migrations ao `start:prod`.

## Railway start command

Este repositorio inclui `railway.json` com:

```bash
npm run start:railway
```

Esse script executa:

```bash
npm run start:prod
```

Use esse comando no Railway para evitar que uma migration lenta ou travada bloqueie
o healthcheck e deixe a aplicacao fora do ar com 502. O `start:prod` continua
intencionalmente limitado a iniciar o backend.

Migrations continuam obrigatorias, mas devem rodar como etapa controlada:

```bash
npm run db:migrate
```

Rode esse comando pelo terminal/job do Railway ou em um ambiente conectado ao mesmo
Supabase antes de publicar uma versao que dependa de tabelas novas, como
`dev_workspaces`.

## Migrations

Toda mudanca estrutural de banco deve ser commitada em:

```text
prisma/migrations/<timestamp_nome>/migration.sql
```

Para aplicar migrations em producao:

```bash
npm run db:migrate
```

Rode esse comando quando houver migration nova, antes ou depois do deploy, conforme a mudanca exigir. Em Railway, prefira executar como etapa manual/controlada ou job separado. Evite pre-deploy automatico se ele puder travar a publicacao.

O Prisma CLI prioriza `DIRECT_URL`. Se a Session Pooler `:5432` nao estiver acessivel e `npm run db:migrate` falhar, aplique o conteudo do `migration.sql` pendente pelo Supabase SQL Editor somente como plano B. Depois, reconcilie o historico da migration antes do proximo deploy.

## Validacao antes do deploy

```bash
npx prisma validate
npm run build
npm run build:frontend
npm test
```

## Supabase SQL Editor

O Supabase SQL Editor nao e o fluxo principal para schema do NextStock. Use-o apenas para consultas diagnosticas ou como plano B quando o Prisma CLI nao conseguir acessar uma conexao adequada para migration.

Se uma correcao mudar estrutura de banco, ela deve virar migration Prisma antes de ser considerada pronta para deploy.

## Branch isolation rollout

`Product` and `PaymentMachine` are branch-wide. The branch-isolation migration adds
nullable `branch_id` columns without guessing ownership for legacy rows. Rows with a
null branch are intentionally hidden by the backend until an operator reviews the
read-only report at `sql/audit/multitenant_integrity_audit.sql` and assigns each row
to the correct branch through a separately reviewed data-fix procedure.

Do not mass-assign legacy rows to the first branch of a tenant.

## Pet photo storage

Pet photo object paths include `tenantId/branchId/petId`, and upload/removal is
authorized by the backend. The current UI persists public URLs, so changing the
`pet-photos` bucket to private requires a coordinated signed-URL read flow before the
bucket policy changes. Keep this as an explicit production decision; do not make the
bucket private without releasing the signed-URL flow at the same time.
