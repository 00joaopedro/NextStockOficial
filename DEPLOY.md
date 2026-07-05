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

## Railway start command

Este repositorio inclui `railway.json` com:

```bash
npm run start:railway
```

Esse script executa:

```bash
npm run start:prod
```

Migrations nao fazem parte do start normal. Execute `npm run railway:migrate`
uma unica vez em um job controlado, depois de backup, validacao em staging e
aprovacao. Somente entao promova/inicie a release compativel.

O `start:prod` continua intencionalmente limitado a iniciar o backend, o que permite
smoke tests sem reaplicar migrations.

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
requires `CORS_ALLOWED_ORIGINS`, `PUBLIC_APP_URL` and a strong
`BILLING_EXTERNAL_REFERENCE_SECRET`. Use HTTPS origins only. Set
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
