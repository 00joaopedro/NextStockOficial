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

## Supabase Storage

Uploads de imagens passam pelo backend com `SUPABASE_SERVICE_ROLE_KEY`; o
frontend nunca envia tenant/branch como fonte de autoridade.

Configure os buckets no Supabase Storage antes de usar uploads em producao:

```env
SUPABASE_STORAGE_BUCKET_PET_PHOTOS="pet-photos"
PET_PHOTO_MAX_SIZE_MB="5"
SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES="product-images"
PRODUCT_IMAGE_MAX_SIZE_MB="5"
SUPABASE_STORAGE_BUCKET_EXPENSE_FILES="expense-files"
EXPENSE_FILE_MAX_SIZE_MB="10"
SUPABASE_STORAGE_BUCKET_SALE_DOCUMENTS="sale-documents"
SUPABASE_STORAGE_SIGNED_URLS="false"
```

- `SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES` define o bucket usado por
  `POST /api/products/:id/images/upload`. Se estiver ausente, o backend usa
  `product-images`.
- `SUPABASE_STORAGE_BUCKET_EXPENSE_FILES` define o bucket usado por
  `POST /api/expenses/:id/files/upload`. Se estiver ausente, o backend usa
  `expense-files`.
- `EXPENSE_FILE_MAX_SIZE_MB` limita anexos de despesas. O padrao e `10`.
- `SUPABASE_STORAGE_BUCKET_SALE_DOCUMENTS` define o bucket privado reservado
  para XML/PDF de NFC-e e NF-e. Se ausente, o backend usa `sale-documents`.
  Downloads fiscais sempre usam signed URL, independentemente da configuracao
  geral de URLs publicas.
- Com `SUPABASE_STORAGE_SIGNED_URLS` ausente ou `false`, os buckets precisam ser
  publicos para que as URLs retornadas por `getPublicUrl()` renderizem no
  navegador.
- Com `SUPABASE_STORAGE_SIGNED_URLS=true`, o backend retorna signed URLs de
  leitura; nesse caso os buckets podem ser privados, mas as URLs expiram.
- Se o bucket configurado nao existir, o upload retorna 503 com mensagem clara
  pedindo a criacao/correcao do bucket.

## Modulo fiscal NF-e 55

O modulo fiscal usa `SaleDocument` como fonte de verdade e exige uma `Sale`
paga para transmissao. `Order` pode apenas preencher um rascunho.

- O bucket `sale-documents` deve ser privado. XML e DANFE sao entregues somente
  por signed URL apos validacao de tenant e filial.
- A configuracao fiscal e por filial em `company_fiscal_configs`.
- Certificados e tokens nao devem ser gravados em `provider_config`; use
  `certificate_secret_ref` apontando para um secret manager ou cofre do provider.
- O adapter `mock` existe para desenvolvimento e homologacao interna. Ele nunca
  retorna `authorized` e a API recusa seu uso quando a configuracao fiscal esta
  em ambiente `producao`.
- Um provider real deve implementar `FiscalProvider` e obter credenciais somente
  por variaveis protegidas/secrets do Railway.

Antes de habilitar emissao real, configure o provider, o certificado A1, o
ambiente correto, a serie fiscal e o bucket privado. Nao exponha o bucket ao
papel `anon`.

## Historico de vendas

`Sale` e a fonte de verdade para vendas pagas. Um `Order` continua representando
pedido/separacao/entrega; mudar um pedido para `paid` cria uma unica `Sale` por
`orderId`, sem nova baixa de estoque. Vendas diretas em `POST /api/sales` baixam
estoque na propria transacao.

Recibos internos podem ser impressos pela API. NFC-e 65 e NF-e 55 permanecem em
`draft` ate existir integracao real com um provedor fiscal/SEFAZ; o backend nao
marca documentos fiscais como autorizados por simulacao. A integracao do
`caixa.html` com `POST /api/sales` e a criacao de movimentos financeiros ficam
como etapa separada, pois o caixa atual ainda nao possui um dominio financeiro
persistido.

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

Esse script apenas chama `npm run start:prod`. Migrations continuam sendo aplicadas por
`npm run db:migrate` como etapa manual/controlada ou job separado. Isso impede que
uma migration lenta/travada bloqueie o healthcheck da Railway e derrube a API com
502.

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
