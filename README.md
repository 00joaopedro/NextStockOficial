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

Esse comando pode ser executado manualmente pelo terminal da Railway, por job separado, ou no pipeline antes/depois do deploy, desde que nao bloqueie a inicializacao normal do backend.

Veja tambem [DEPLOY.md](./DEPLOY.md).
