# NextStock

Backend NestJS + Prisma para Supabase PostgreSQL, com frontend HTML/CSS/JS puro servido pela propria aplicacao.

## Setup local

```bash
npm install
```

Configure `.env` com as variaveis do projeto. Para Prisma com Supabase/PostgreSQL, as principais sao:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
```

- `DATABASE_URL`: runtime no Railway usando Supabase Transaction Pooler na porta `6543`.
- `pgbouncer=true`: desativa prepared statements incompativeis com Transaction Pooler.
- `connection_limit=1`: evita que uma instancia da aplicacao consuma conexoes demais.
- `DIRECT_URL`: Prisma CLI/migrations usando preferencialmente Supabase Session Pooler na porta `5432`, que nao exige o IPv4 Add-On/Pro.

O backend tambem normaliza URLs runtime na porta `6543` para garantir `sslmode=require`, `pgbouncer=true` e `connection_limit=1`.

## Banco de dados

Todas as alteracoes estruturais de banco devem viver em `prisma/migrations`.

Fluxo recomendado:

```bash
npm run db:migrate
npx prisma validate
```

Nao use o Supabase SQL Editor como fluxo principal de schema. Scripts SQL soltos neste repositorio existem apenas como diagnostico ou referencia historica; a aplicacao deve evoluir o banco por migrations Prisma versionadas.

Se `npm run db:migrate` nao conseguir conectar nem pela Session Pooler, use o `migration.sql` pendente no Supabase SQL Editor somente como plano B operacional e registre a migration aplicada antes do proximo deploy.

## Desenvolvimento

```bash
npm run start:dev
```

## Build e testes

```bash
npx prisma validate
npm run build
npm run build:frontend
npm test
```

## Producao

O comando de producao deve apenas iniciar o backend:

```bash
npm run start:prod
```

Nao coloque `prisma migrate deploy` dentro do `start:prod` nem em um pre-deploy que possa travar o boot da Railway.

Quando houver migration nova, rode:

```bash
npm run db:migrate
```

No Railway, este repositorio versiona `railway.json` para usar:

```bash
npm run start:railway
```

Esse script aplica `npm run db:migrate` e depois inicia `npm run start:prod`.
Ele existe para impedir que o backend suba sem tabelas versionadas como
`dev_workspaces`, mantendo `start:prod` sem migrations acopladas.

### Multi-tenant integrity

Application requests are scoped by the backend `TenantContextService`; values stored in
the browser are never authorization sources. Before applying security migrations in an
existing database, run the read-only report:

```text
prisma/audit/multitenant_integrity_audit.sql
```

Review and correct reported legacy inconsistencies explicitly before validating the
composite foreign keys.

Current ownership rules:

- products and payment machines are tenant-wide and shared between the tenant branches;
- Pet Shop clients, pets, photos and appointments are branch-wide;
- the current `TenantMember` model grants one branch per user/tenant. Supporting
  multiple branches per user requires a separate access-model decision and migration;
- only an allowlisted Dev SuperAdmin may select a branch outside its own tenant.

Esse comando pode ser executado manualmente pelo terminal da Railway, por job separado, ou no pipeline antes/depois do deploy, desde que nao bloqueie a inicializacao normal do backend.

Veja tambem [DEPLOY.md](./DEPLOY.md).
