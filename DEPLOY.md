# Deploy NextStock

Este projeto usa Prisma Migrate como fonte oficial de alteracoes de banco.

## Variaveis obrigatorias para banco

Configure no Railway:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
ADMIN_DATABASE_URL=""
```

- `DATABASE_URL`: conexao runtime pela Supabase Transaction Pooler, porta `6543`.
- `pgbouncer=true`: impede prepared statements incompativeis com Transaction Pooler.
- `connection_limit=1`: limita o pool interno do Prisma por instancia.
- `DIRECT_URL`: conexao do Prisma CLI para migrations e scripts administrativos. Sem plano Pro/IPv4 Add-On, use preferencialmente a Supabase Session Pooler na porta `5432`.
- `ADMIN_DATABASE_URL`: opcional; quando configurada, sobrescreve `DIRECT_URL` apenas para scripts/migrations administrativos.

`DIRECT_URL`/`ADMIN_DATABASE_URL` nunca devem apontar para a Supabase Transaction Pooler na porta `6543`. Esse pooler e adequado para runtime com `pgbouncer=true`, mas causa erros de prepared statement em `prisma migrate deploy`, `audit-schema` e `audit-user`.

Ambas devem apontar para o mesmo projeto Supabase do ambiente. Copie os hosts/usuarios exatos exibidos em `Connect` no dashboard Supabase.

## Variaveis obrigatorias no Railway

Use `.env.production.example` como inventario, sem enviar esse arquivo preenchido
ao Git. O bootstrap de producao exige:

- banco/Supabase: `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF` e
  `PRODUCTION_SUPABASE_PROJECT_REF`;
- web: `CORS_ALLOWED_ORIGINS` (somente origens HTTPS) e `PUBLIC_APP_URL`;
- auditoria/sessao: `AUDIT_HASH_SECRET` com ao menos 32 caracteres;
- fiscal: `CERT_ENCRYPTION_KEY` (base64 de exatos 32 bytes) e
  `CERT_ENCRYPTION_KEY_VERSION`;
- billing: as flags explicitas `BILLING_CHECKOUT_ENABLED`,
  `BILLING_WEBHOOK_ENABLED` e `BILLING_ENFORCEMENT_ENABLED`.

`DIRECT_URL` ou `ADMIN_DATABASE_URL` e necessario para o job controlado de migrations,
mas nao e usado para iniciar o servidor HTTP. `SESSION_HASH_SECRET` pode ser
separado; quando ausente, o backend usa `AUDIT_HASH_SECRET`.

Se checkout e webhook estiverem ambos `false`, credenciais Mercado Pago e
`BILLING_EXTERNAL_REFERENCE_SECRET` nao bloqueiam o boot. Se checkout ou webhook
for habilitado, o secret de referencia passa a ser obrigatorio. Webhook habilitado
tambem exige access token, webhook secret e collector id.
Em producao, webhook habilitado exige `MERCADO_PAGO_MODE=production`.

O modulo fiscal esta carregado no processo e valida sua chave no bootstrap. Use
uma chave nova por ambiente e nao reutilize chaves de JWT, Supabase, billing ou
auditoria.

## Incidente HTTP 502 por bootstrap

O incidente diagnosticado na Railway era um encerramento do processo durante
`ConfigModule.forRoot`, antes de o Nest abrir a porta. As primeiras variaveis
ausentes eram `CORS_ALLOWED_ORIGINS`, `PUBLIC_APP_URL` e
`BILLING_EXTERNAL_REFERENCE_SECRET`. A revisao tambem encontrou um segundo
crash: o modulo fiscal e carregado no bootstrap e rejeita
`CERT_ENCRYPTION_KEY` ausente ou invalida.

O validador agora apresenta somente os nomes ausentes/invalidos, sem imprimir
valores. Para gerar secrets independentes no terminal, execute cada comando
separadamente e salve a saida diretamente nas variaveis protegidas da Railway:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use esse comando três vezes, sem reutilizar resultados, para
`AUDIT_HASH_SECRET`, `SESSION_HASH_SECRET` e
`BILLING_EXTERNAL_REFERENCE_SECRET`.

Para a chave fiscal, que exige base64 convencional de exatamente 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cadastre o resultado como `CERT_ENCRYPTION_KEY` e defina
`CERT_ENCRYPTION_KEY_VERSION=v1`. Nao registre essas saidas em tickets, logs,
commits ou arquivos `.env` versionados.

## Checklist Railway

1. Cadastre as variaveis de `.env.production.example` como variaveis protegidas.
2. Gere secrets unicos por ambiente e mantenha logs de diagnostico JWT desligados.
3. Confirme que `DATABASE_URL`, `DIRECT_URL`/`ADMIN_DATABASE_URL`, `SUPABASE_URL` e project refs
   pertencem ao mesmo projeto de producao. A URL administrativa nao pode usar `pooler.supabase.com:6543`.
4. Configure as três flags de billing explicitamente; so adicione credenciais
   Mercado Pago quando checkout/webhook forem habilitados.
5. Gere e cadastre a chave fiscal A1 no formato documentado.
6. Produza e valide um backup.
7. Confirme que o pre-deploy do servico executa `npm run railway:migrate` uma
   unica vez antes de cada release.
8. Execute o deploy normal; somente depois do pre-deploy bem-sucedido a Railway
   executara `npm run start:railway`.
9. Confirme `GET /api/health` e depois `GET /api/health/ready`.

O healthcheck da Railway usa `/api/health/ready`. Alem de conectar ao PostgreSQL,
esse endpoint exige as tabelas publicas essenciais (`tenants`, `branches`, `profiles`,
`tenant_members` e `security_audit_events`). Um banco vazio ou com migrations
incompletas nao deve receber trafego como uma instancia saudavel.

O runtime normaliza automaticamente URLs `:6543` para garantir os parametros PgBouncer. Mesmo assim, configure a URL completa no Railway para deixar a infraestrutura explicita.

## Scripts importantes

```bash
npm run build
npm run start:prod
npm run start:railway
npm run db:migrate
```

## Supabase Storage

Crie os buckets usados pelo backend no Supabase Storage do mesmo projeto
configurado em `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`:

```env
SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES="product-images"
PRODUCT_IMAGE_MAX_SIZE_MB="5"
SUPABASE_STORAGE_BUCKET_PET_PHOTOS="pet-photos"
PET_PHOTO_MAX_SIZE_MB="5"
SUPABASE_STORAGE_SIGNED_URLS="false"
```

O endpoint de upload de produto `POST /api/products/:id/images/upload` le
`SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES`; quando a variavel nao existe, o nome
padrao usado pelo backend e `product-images`.

Decisao atual:

- `SUPABASE_STORAGE_SIGNED_URLS=false` ou ausente: buckets publicos, URLs
  renderizaveis via `getPublicUrl()`.
- `SUPABASE_STORAGE_SIGNED_URLS=true`: buckets podem ser privados, e o backend
  retorna signed URLs de leitura.

Se o bucket nao existir, o backend retorna 503 em vez de 500 generico. Corrija
criando o bucket com o mesmo nome da env ou ajustando a env para o bucket
existente.

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

## Railway Config as Code, pre-deploy e start

Este repositorio inclui `/railway.json` com as fases separadas:

```json
{
  "deploy": {
    "preDeployCommand": "npm run railway:migrate",
    "startCommand": "npm run start:railway"
  }
}
```

`preDeployCommand` pertence a secao `deploy`, no mesmo nivel de
`startCommand`. O pre-deploy roda com as variaveis do servico e precisa terminar
com sucesso antes que a nova release seja iniciada. O comando de start continua
executando somente:

```bash
npm run start:prod
```

Migrations nao fazem parte do start normal: sao uma fase controlada e separada
do deploy. O `prisma migrate deploy` e repetivel e aplica apenas migrations
pendentes. Ainda assim, valide primeiro em staging, produza backup e obtenha a
aprovacao antes de promover a mesma release para producao.

No painel Railway, em **Service > Settings > Source**:

- deixe **Root Directory** vazio (raiz do repositorio) ou defina `/`;
- defina **Config File Path** exatamente como `/railway.json`;
- nao use um caminho do filesystem do container, como
  `/workspace/NextStockOficial/railway.json`;
- apos salvar, confira no deploy details que o pre-deploy resolvido e
  `npm run railway:migrate` e que ele aparece antes do start.

O Config File Path e relativo a raiz do repositorio, inclusive quando o servico
possui Root Directory. Se no futuro o app for movido para um subdiretorio, mova
tambem o arquivo ou mantenha o caminho absoluto do repositorio no painel; para o
layout atual, a configuracao suportada e `/railway.json` com Root Directory `/`.

Antes de chamar o Prisma, `railway:migrate` valida que `DIRECT_URL` ou
`ADMIN_DATABASE_URL` existe nos ambientes controlados, rejeita
`pooler.supabase.com:6543`, confere que host/usuario corresponde a
`SUPABASE_PROJECT_REF` e que staging nao reutiliza o project ref de producao.
O script nao imprime URL nem credenciais.

O `start:prod` continua intencionalmente limitado a iniciar o backend. Nao copie
o comando de migration para `start:prod` ou `start:railway`.

Nao configure `NPM_CONFIG_PRODUCTION=true`: essa opcao e obsoleta e gera o warning
`Use --omit=dev instead`. O build atual precisa de dependencias de desenvolvimento
como Nest CLI e TypeScript. Portanto, no builder Railway, remova também
`NPM_CONFIG_OMIT=dev`; omissao de dev dependencies so e adequada em uma imagem
runtime separada, depois de o build estar pronto.

## Migrations

Toda mudanca estrutural de banco deve ser commitada em:

```text
prisma/migrations/<timestamp_nome>/migration.sql
```

Para aplicar migrations em staging ou producao por job unico:

```bash
npm run railway:migrate
```

Rode primeiro em staging, execute smoke tests e produza/valide o backup antes
do job de producao. Rollback da aplicacao nao desfaz schema: para banco, prefira
uma migration aditiva de roll-forward revisada.

O Prisma CLI prioriza `ADMIN_DATABASE_URL` e depois `DIRECT_URL` para `migrate`. Se a Session Pooler `:5432` nao estiver acessivel e `npm run railway:migrate` falhar, aplique o conteudo do `migration.sql` pendente pelo Supabase SQL Editor somente como plano B. Depois, reconcilie o historico da migration antes do proximo deploy.

### Recuperacao segura de P3009/P3018

Nao use `prisma db push` e nao execute `prisma migrate resolve --applied` apenas
para liberar o deploy. Primeiro interrompa a promocao, preserve um backup e
consulte `_prisma_migrations` e o catalogo PostgreSQL pela conexao administrativa.
Para `20260701010000_internal_receipt_status`, comprove separadamente:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
FROM "_prisma_migrations"
WHERE migration_name = '20260701010000_internal_receipt_status';

SELECT EXISTS (
  SELECT 1
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'SaleDocumentStatus'
    AND e.enumlabel = 'internal_issued'
) AS internal_issued_exists;
```

A migration de `20260701010000` contem somente o `ALTER TYPE ... ADD VALUE IF
NOT EXISTS`; o uso/backfill do valor ocorre na migration posterior
`20260708000000_apply_internal_receipt_status`. Assim:

1. se o registro falhou e o enum **nao existe**, preserve os logs da causa,
   corrija apenas a causa operacional, marque a tentativa como `--rolled-back`
   e deixe `prisma migrate deploy` executar o SQL versionado novamente;
2. se o enum existe, nao presuma que a migration inteira foi aplicada: compare
   o SQL versionado e a evidencia do catalogo. Somente depois de comprovar que
   todo o SQL foi executado e revisado e permitido reconciliar o historico;
3. se houver qualquer divergencia ou SQL parcial em uma migration com mais de
   uma instrucao, crie um plano de roll-forward aditivo revisado. Nao apague a
   linha de `_prisma_migrations`, nao edite migrations versionadas e nao apague
   dados.

O ambiente local deste repositorio nao contem as credenciais do staging; por
isso o estado `P3009`/`P3018` so pode ser confirmado no alvo pela conexao direta.
O pre-deploy falhara fechado e o start nao ocorrera enquanto esse estado nao for
resolvido com evidencia.

Para verificar host/porta sem vazar senha:

```bash
npx ts-node -e "const { describeDatabaseUrl } = require('./scripts/lib/admin-database-url'); console.log(describeDatabaseUrl(process.env.ADMIN_DATABASE_URL || process.env.DIRECT_URL || ''))"
```

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

## Fiscal rollout

Apply `20260613000000_fiscal_nfe_production_structure` before enabling the new
`/api/fiscal` routes. Then:

Apply `20260701010000_internal_receipt_status` after the fiscal structure. It
adds `internal_issued`, backfills legacy `receipt/authorized` rows and installs
a non-fiscal check for new internal receipts. Run the fiscal and sales-history
audit SQL after deployment.

1. Create a private Supabase Storage bucket named `sale-documents`.
2. Set `SUPABASE_STORAGE_BUCKET_SALE_DOCUMENTS=sale-documents` in Railway.
3. Create the branch fiscal configuration through
   `PATCH /api/fiscal/company-config`.
4. Keep `environment=homologacao` and `provider=mock` until a real fiscal
   provider adapter and protected credentials are configured.
5. Run `sql/audit/fiscal_ntfe_production_audit.sql`.

For the A1 certificate flow, also apply
`20260701000000_fiscal_a1_certificate` and configure:

```env
CERT_ENCRYPTION_KEY="<base64 encoding of exactly 32 random bytes>"
CERT_ENCRYPTION_KEY_VERSION="v1"
SUPABASE_STORAGE_BUCKET_FISCAL_CERTIFICATES="fiscal-certificates"
CERTIFICATE_MAX_SIZE_MB="5"
```

Create `fiscal-certificates` as a private bucket with no `anon` or
`authenticated` read policy. Only the backend service-role client may upload,
download, or remove objects. Never enable public or signed certificate URLs.

Railway rollout:

1. Create the private bucket and verify its policies.
2. Add the four variables above as protected Railway variables.
3. Deploy the additive migration with `npm run migrate:deploy`.
4. Deploy the application; invalid encryption configuration intentionally stops
   boot without printing key material.
5. Keep every branch in `homologacao` with provider `mock`.
6. Run the focused certificate/fiscal tests before introducing a real A1.

The current release validates synthetic PKCS#12 fixtures only and does not
integrate with a real SEFAZ service. A future real-certificate checklist must
cover password opening, private key presence, ICP-Brasil chain, validity, issuer
CNPJ match, XML signature/XSD, service status and NF-e issuance in homologation
before any production activation.

The mock provider is intentionally unable to authorize or cancel a fiscal
document. Do not switch a branch to fiscal production while its provider is
`mock`.

## Security hardening rollout

Production boot validates database/Supabase configuration and additionally
requires `CORS_ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, audit/fiscal secrets and
explicit billing feature flags. A strong `BILLING_EXTERNAL_REFERENCE_SECRET`
is conditional on checkout/webhook being enabled. Use HTTPS origins only. Set
`MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS=600` (or a reviewed lower value).
Never reuse JWT, Supabase or Mercado Pago secrets for the billing reference
secret.

Helmet is enabled. CSP starts in report-only mode (`CSP_ENFORCE=false`) because
legacy pages still contain inline scripts. Review CSP reports and remove the
remaining inline scripts before enabling enforcement.

Apply the additive migration `20260701020000_security_rls_hardening` with
`npm run migrate:deploy`. It enables RLS and revokes `anon`/`authenticated`
table access for orders, employees, suppliers, expenses and plans. Before and
after deployment, audit the live project:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee;
```

Expense files must use a private bucket. The backend always returns short-lived
signed URLs for those files. In-memory rate limiting is an initial safeguard
only; use a Redis-backed limiter before running multiple Railway replicas.
Document uploads still require an antimalware pipeline before accepting
untrusted Office files at scale.

## Sessions and stored-file rollout

Apply `20260705000000_sessions_and_stored_files` first in staging. Keep
`SESSION_ENFORCEMENT_ENABLED=false` and `UPLOAD_ENABLE_QUOTAS=false` during the
first deploy. Confirm that new logins create `user_sessions`, uploads create
`stored_files`, logout revokes the current row and `/api/health/ready` succeeds.

After the coordinated login rollout, enable session enforcement. Generate
`npm run uploads:quota-report`, review plan/default limits and only then enable
quotas. Office/PDF files are inventoried as `PENDING`; a real antimalware
adapter remains required before enforcing scan status.

## Pet photo storage

Pet photo object paths include `tenantId/branchId/petId`, and upload/removal is
authorized by the backend. The current UI persists public URLs, so changing the
`pet-photos` bucket to private requires a coordinated signed-URL read flow before the
bucket policy changes. Keep this as an explicit production decision; do not make the
bucket private without releasing the signed-URL flow at the same time.
