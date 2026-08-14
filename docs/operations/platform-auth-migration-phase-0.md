# Fase 0 — Preparação segura para migração de plataforma, banco, autenticação e storage

Status: proposta técnica/documentação. Esta fase não implementa comportamento runtime, não cria migrations, não troca providers e não executa operações externas.

## Guardrails desta fase

- Não acessar Railway, Supabase, Google Cloud, SuperTokens ou bancos reais.
- Não executar `prisma db push`, `prisma migrate deploy`, `migrate resolve` ou scripts que alterem dados/infra.
- Não gerar, copiar ou registrar credenciais, dumps ou PII.
- Manter o Supabase Auth ativo até decisão oficial e rollout futuro.
- Limitar o diff a documentação.

## Leituras e evidências locais

A avaliação foi feita apenas com arquivos versionados e buscas locais. Foram lidos os arquivos obrigatórios, incluindo `package.json`, `package-lock.json`, `.env.example`, `prisma.config.ts`, `prisma/schema.prisma`, todas as 60 migrations em `prisma/migrations`, bootstrap NestJS, módulos de auth/sessions/storage/fiscal/observability/audit, `railway.json`, `DEPLOY.md`, `README.md`, `docs/security/*`, `docs/operations/*` e testes relevantes em `src`, `test/security` e `test/helpers`.

Buscas obrigatórias executadas e usadas como apoio:

```bash
rg -n "supabase|SUPABASE|auth\.|admin\.createUser|admin\.deleteUser|signIn|signUp|resetPassword|recover|refresh|jwt|JWKS|cookie|session|UserProfile|TenantMember|externalId|authUserId|storage|bucket|signedUrl|DATABASE_URL|DIRECT_URL|ADMIN_DATABASE_URL|pooler|Railway|PORT|health|readiness|WebSocket|cron|Schedule|SuperTokens|email" src public test scripts prisma docs .github *.json *.ts *.md .env.example railway.json --hidden

rg -n "ENABLE ROW LEVEL SECURITY|CREATE POLICY|service_role|auth\.uid|CREATE EXTENSION|gen_random_uuid|uuid_generate|CREATE FUNCTION|CREATE TRIGGER|CREATE VIEW|FOR UPDATE SKIP LOCKED|pg_advisory|isolation|SERIALIZABLE|REVOKE|GRANT|CREATE ROLE|ALTER ROLE|large object|lo_" prisma/migrations src scripts prisma/audit
```

## Estado atual da arquitetura

### Aplicação

- Backend NestJS/Fastify com API prefixada em `/api`, CORS configurado por env, cookies via Fastify e CSP/Helmet no bootstrap.
- Frontend estático HTML/CSS/JS em `public/`, com fontes TypeScript em `frontend-src/` compiladas para `public/dist/`.
- Prisma é a camada de dados. `DATABASE_URL` é a conexão runtime e `DIRECT_URL`/`ADMIN_DATABASE_URL` são destinadas a Prisma CLI, migrations e scripts administrativos.
- Readiness expõe `/api/health/ready` e valida compatibilidade mínima do schema antes de receber tráfego.
- Auditoria possui outbox transacional com timer in-process e idempotência por `(tenant_id, operation_id)`.

### Separação Supabase explícita

#### Supabase PostgreSQL

Uso atual:

- Banco primário da aplicação via Prisma.
- Runtime usa Supabase Transaction Pooler (`:6543`, `pgbouncer=true`) conforme `.env.example` e `DEPLOY.md`.
- Operações administrativas/migrations devem usar `DIRECT_URL` ou `ADMIN_DATABASE_URL`, com validação para não apontar para o transaction pooler.
- Migrations incluem RLS/policies/roles Supabase/PostgREST e extensões PostgreSQL como parte da história versionada.

Portabilidade:

- O domínio de negócio está modelado em Prisma e SQL PostgreSQL.
- Antes de Cloud SQL, cada extensão, role, policy, trigger, função, índice e recurso específico de Supabase precisa ser validado em staging do destino.

#### Supabase Auth

Uso atual:

- `SupabaseService` cria clientes `anon` e `admin` com `SUPABASE_URL`, chave pública/anon e `SUPABASE_SERVICE_ROLE_KEY`.
- `AuthService.register` cria usuário via `supabase.admin.auth.admin.createUser` e depois cria `Tenant`, `Branch`, `UserProfile` e `TenantMember` no PostgreSQL.
- Login, refresh, recovery e logout ainda dependem de APIs Supabase Auth e JWT Supabase.
- `JwtStrategy` valida JWT por cookie `jwt` ou Bearer; usa JWKS derivado de `SUPABASE_URL` quando possível, ou `SUPABASE_JWT_SECRET` legado.
- `UserAuthAdapter` já existe, mas cobre principalmente create/delete/lookup de usuário Supabase e ainda não cobre todos os fluxos de login/recovery/session.

#### Supabase Storage

Uso atual:

- `SupabaseStorageService` usa Storage admin para fotos de pets, imagens de produtos, arquivos de despesas e documentos fiscais/vendas.
- `CertificateStorageService` usa bucket privado para certificados A1 e signed URLs/downloads controlados pelo backend.
- A aplicação mantém metadados locais em tabelas como `stored_files`, quotas e referências de `storagePath`; migrar PostgreSQL não move objetos.

#### Supabase REST/Realtime

- Nenhum uso direto de Supabase REST/PostgREST ou Realtime foi identificado como caminho runtime principal no backend/frontend por busca local.
- Há migrations e scripts relacionados a roles RLS/PostgREST (`anon`, `authenticated`, `service_role`) que existem por compatibilidade do projeto Supabase e devem ser revisados se o banco-alvo for Cloud SQL sem stack Supabase.

#### Recursos próprios NextStock no PostgreSQL

- Identidade de negócio: `UserProfile`, `TenantMember`, `Branch`, `Tenant`, `DevWorkspace` e memberships.
- Multi-tenant/multi-branch: FKs, índices compostos e guards/services de contexto local.
- Segurança: sessões locais, rate limit de auth em PostgreSQL, audit outbox, produção sem stack trace, CSP/CORS, quotas de upload.
- Billing, fiscal, storage metadata, workers/outbox e readiness são recursos da aplicação e não devem ser substituídos por provider de identidade.

## Dependências diretas

### Railway

- `railway.json` define build (`npm run build && npm run build:frontend`), `preDeployCommand` com `npm run railway:migrate`, start `npm run start:railway` e healthcheck `/api/health/ready`.
- `DEPLOY.md` descreve Railway como fluxo operacional atual, variáveis e healthcheck.
- Variáveis `RAILWAY_*` aparecem para estimativas/custos/identificação de projeto/ambiente/serviço.
- `RAILWAY_DEPLOYMENT_ID` é usado apenas para log de reinício lógico no bootstrap.

### Supabase

- `@supabase/supabase-js` é dependência direta.
- `SupabaseService` é required no runtime atual por auth e storage.
- Auth admin é chamado em cadastro, login/recovery/refresh/logout e user provisioning.
- Storage admin é usado por módulos de pets, products, expenses, fiscal certificates e sale documents.
- URLs/conexões de banco pressupõem poolers Supabase no exemplo/DEPLOY.
- Guardrails de projeto usam `SUPABASE_PROJECT_REF`, refs de produção/staging e `SUPABASE_ACCESS_TOKEN` em scripts controlados.

### Componentes já portáveis

- NestJS/Fastify, Prisma, DTOs/ValidationPipe, filtros de erro, CORS/CSP, módulos de domínio, sessões locais, rate limit em PostgreSQL, audit outbox e readiness.
- Frontend estático pode continuar sendo servido pelo NestJS ou por provider separado desde que CORS/CSP/cookies/domínio sejam revalidados.
- Migrations Prisma são append-only; a cadeia pode ser validada contra banco vazio em staging sem alterar produção.

## Riscos principais

### Identidade

- `UserProfile.id` é a identidade de negócio e possui muitas FKs. Hoje o cadastro usa o `id` retornado pelo Supabase Auth como `UserProfile.id` e também como `supabaseUserId` em fluxos existentes.
- `UserProfile.email` é único, mas um rollout com dois providers pode criar conflito se o mesmo email apontar para perfis diferentes.
- Tokens/cookies atuais (`jwt` e `nextstock_session`) precisam coexistir até decisão oficial sobre SuperTokens Session, subject JWT e logout global.
- Export/import de usuários e hashes do Supabase Auth para SuperTokens não deve ser assumido sem documentação oficial e teste de compatibilidade.

### Banco

- Migrations contêm RLS/policies/roles, funções/triggers, extensões e SQL raw. Cloud SQL PostgreSQL precisa ser validado contra todas as migrations desde banco vazio e contra restore realístico em staging.
- Pooling atual está desenhado para Supabase pooler; Cloud SQL exigirá decisão oficial sobre Auth Proxy/Connector, pool, limites e timeout.
- `preDeployCommand` executa migrations na Railway; em Google Cloud deve existir mecanismo de execução única, com locking/rollback e sem rodar em todas as réplicas.

### Storage

- Metadados e caminhos estão no PostgreSQL; bytes vivem no Supabase Storage.
- Buckets privados, signed URLs, headers, TTL, metadata e permissões precisam de inventário por bucket.
- Durante coexistência, downloads devem resolver provider antigo e novo sem expor objetos privados.

### Workers/jobs

- Audit outbox usa timer in-process. Em múltiplas réplicas, pode haver N workers concorrentes. A query de claim precisa ser validada para concorrência e/ou separada em job/worker controlado.
- Jobs de manutenção (`sessions:cleanup`, relatórios, quota, billing reconcile, storefront cleanup) precisam de ownership operacional claro em Cloud Run/GKE/Cloud Scheduler/Jobs.

### Rollback

- Rollback de auth precisa preservar mapeamento de identidades por email/provider e impedir dois perfis para o mesmo usuário.
- Rollback de banco precisa definir ponto de corte, restore/PITR, CDC reverso ou janela de downtime; dual-write genérico não é a estratégia padrão.
- Rollback de storage precisa suportar leitura de objetos no provider antigo após banco já migrado ou após retorno ao ambiente anterior.

## Matriz de decisões oficiais obrigatórias antes das próximas fases

### SuperTokens

- [ ] Managed Service vs Core self-hosted.
- [ ] Suporte oficial a NestJS/Fastify.
- [ ] Suporte oficial a EmailPassword.
- [ ] Suporte oficial a Session.
- [ ] Suporte oficial a EmailVerification.
- [ ] Suporte oficial a AccountLinking.
- [ ] Suporte oficial a Multitenancy, se necessário.
- [ ] Possibilidade ou não de custom user ID.
- [ ] Possibilidade ou não de import de usuários.
- [ ] Compatibilidade ou não com hashes/senhas exportadas do Supabase Auth.
- [ ] Modelo de tabelas do Core.
- [ ] Backup/restore/upgrade do Core.
- [ ] Cookies HttpOnly.
- [ ] CSRF.
- [ ] CORS.
- [ ] Domínio/subdomínio.
- [ ] Revogação e logout global.
- [ ] Recovery/email provider.

### Google Cloud

- [ ] Cloud Run vs GKE Autopilot.
- [ ] Cloud SQL PostgreSQL versão alvo.
- [ ] Extensões suportadas, especialmente `pgcrypto`.
- [ ] Conexão via Cloud SQL Auth Proxy/Connector.
- [ ] Limites de conexão.
- [ ] Estratégia de pool.
- [ ] Execução única de migrations.
- [ ] Database Migration Service/CDC com Supabase como origem.
- [ ] Replicação lógica, se aplicável.
- [ ] Backups e PITR.
- [ ] Rollback.

### Supabase

- [ ] Export de usuários Auth.
- [ ] Export de hashes de senha, se disponível.
- [ ] Compatibilidade de hash com SuperTokens.
- [ ] Desativação gradual de Auth.
- [ ] Export/cópia de Supabase Storage.
- [ ] Metadata de objetos.
- [ ] Signed URLs.
- [ ] Limites do plano atual para CDC/replicação lógica.

## ADRs propostos

### ADR-001 — Manter `UserProfile.id` como identidade de negócio

Decisão proposta:

- Não recriar `UserProfile.id` durante migração de auth.
- Não assumir que SuperTokens manterá o mesmo ID.
- Introduzir futuramente uma tabela `AuthIdentity` ou equivalente.

Justificativa:

- `UserProfile.id` é referenciado por muitas FKs de negócio.
- Hoje o ID está acoplado ao Supabase Auth em fluxos de criação/autenticação.
- Trocar esse ID em massa aumentaria risco de perda, inconsistência ou corrupção de dados.

### ADR-002 — SuperTokens não substitui tenant/branch/roles de negócio

Decisão proposta:

- SuperTokens será, se adotado, provedor de identidade/sessão.
- Tenant, branch, `Role`, `SystemType`, `SystemMode`, memberships e Dev SuperAdmin permanecem no PostgreSQL da aplicação.
- Guards e services de contexto continuam sendo autoridade local.

### ADR-003 — Não fazer dual-write genérico entre bancos

Decisão proposta:

- Evitar dual-write Supabase PostgreSQL + Cloud SQL como solução principal.
- Preferir dump/restore com downtime planejado ou CDC/replicação validada oficialmente.
- Qualquer coexistência deve ter ownership de escrita único por entidade e checks de reconciliação.

### ADR-004 — Storage deve ser migrado separadamente do PostgreSQL

Decisão proposta:

- Não presumir que migrar banco move arquivos.
- Introduzir futuramente adapter de Storage com provider Supabase/GCS.
- Downloads devem funcionar durante coexistência, com provider/path/metadata preservados.

### ADR-005 — Workers devem ser controlados separadamente em ambiente multi-réplica

Decisão proposta:

- API e workers podem ser separados em Google Cloud.
- Evitar timer in-process ativo em todas as réplicas sem controle explícito.
- Jobs devem ter idempotência, locking/claim transacional e configuração por ambiente.

## Inventário de variáveis de ambiente

Não inserir valores reais. Esta lista classifica variáveis atuais e futuras.

### Banco/runtime

- `DATABASE_URL`
- `DATABASE_CONNECTION_LIMIT`
- `NODE_ENV`
- `APP_ENV`
- `PORT`
- `TZ`

### Banco/admin/migrations

- `DIRECT_URL`
- `ADMIN_DATABASE_URL`

### Supabase Auth

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_PASSWORD_REDIRECT_URL`

### Supabase Storage

- `SUPABASE_STORAGE_BUCKET_PET_PHOTOS`
- `SUPABASE_STORAGE_BUCKET_PRODUCT_IMAGES`
- `SUPABASE_STORAGE_BUCKET_EXPENSE_FILES`
- `SUPABASE_STORAGE_BUCKET_SALE_DOCUMENTS`
- `SUPABASE_STORAGE_BUCKET_FISCAL_CERTIFICATES`
- `SUPABASE_STORAGE_SIGNED_URLS`

### Supabase Project Guardrails

- `SUPABASE_PROJECT_REF`
- `PRODUCTION_SUPABASE_PROJECT_REF`
- `STAGING_SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`

### Railway

- `RAILWAY_API_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT_ID`
- `RAILWAY_SERVICE_ID`
- `RAILWAY_DEPLOYMENT_ID`
- `DEV_RAILWAY_MONTHLY_COST_CENTS`
- `DEV_SUPABASE_MONTHLY_COST_CENTS`

### Google Cloud futura

- `GCP_PROJECT_ID` (futura; não criar valor real agora)
- `GCP_REGION` (futura)
- `CLOUD_SQL_INSTANCE_CONNECTION_NAME` (futura)
- `CLOUD_SQL_DATABASE` (futura)
- `CLOUD_SQL_CONNECTOR_MODE` (futura)
- `GOOGLE_APPLICATION_CREDENTIALS`/Workload Identity (decisão futura; evitar arquivo de chave quando possível)

### SuperTokens futura

- `AUTH_PROVIDER` (futura: `supabase`/`supertokens`/modo controlado)
- `SUPERTOKENS_CONNECTION_URI` (futura)
- `SUPERTOKENS_API_KEY` (futura)
- `SUPERTOKENS_APP_NAME` (futura)
- `SUPERTOKENS_API_DOMAIN` (futura)
- `SUPERTOKENS_WEBSITE_DOMAIN` (futura)
- `SUPERTOKENS_COOKIE_DOMAIN` (futura)

### Segurança/auditoria/sessão

- `JWT_SECRET`
- `JWT_DIAGNOSTIC_LOGS`
- `DEV_SUPER_ADMIN_EMAILS`
- `DEV_SUPER_ADMIN_USER_IDS`
- `AUDIT_HASH_SECRET`
- `SESSION_HASH_SECRET`
- `SESSION_ENFORCEMENT_ENABLED`
- `SESSION_RETENTION_DAYS`
- `AUDIT_LOG_ENVIRONMENT`
- `SENTRY_ENVIRONMENT`
- `SENTRY_DSN`
- `SENTRY_RELEASE`
- `AUDIT_OUTBOX_ALERTING_ENABLED`
- `AUDIT_OUTBOX_BACKLOG_ALERT_THRESHOLD`
- `AUDIT_OUTBOX_LAG_SLA_SECONDS`
- `AUDIT_OUTBOX_SHUTDOWN_TIMEOUT_MS`
- `AUDIT_OUTBOX_ALERT_COOLDOWN_SECONDS`
- `AUTH_RATE_LIMIT_ENABLED`
- `AUTH_RATE_LIMIT_STORE`
- `AUTH_RATE_LIMIT_HMAC_SECRET`
- `TRUSTED_PROXY_HOPS`
- `CSP_ENFORCE`
- `CSP_REPORT_ONLY`
- `COMPRESSION_THRESHOLD_BYTES`

### Billing

- `BILLING_DEFAULT_PROVIDER`
- `BILLING_MODE`
- `BILLING_ENFORCEMENT_ENABLED`
- `BILLING_CHECKOUT_ENABLED`
- `BILLING_WEBHOOK_ENABLED`
- `BILLING_EXTERNAL_REFERENCE_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_COLLECTOR_ID`
- `MERCADO_PAGO_MODE`
- `MERCADO_PAGO_PLAN_ID_OURO`
- `MERCADO_PAGO_PLAN_ID_ESMERALDA`
- `MERCADO_PAGO_PLAN_ID_DIAMANTE`
- `MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS`
- `PAGARME_ENABLED`
- `PAGARME_PIX_ENABLED`
- `PAGARME_CARD_ENABLED`
- `PAGARME_API_BASE_URL`
- `STONE_ENABLED`
- `STONE_TERMINALS_ENABLED`
- `STONE_REMOTE_PAYMENTS_ENABLED`

### Fiscal

- `CERT_ENCRYPTION_KEY`
- `CERT_ENCRYPTION_KEY_VERSION`
- `CERTIFICATE_MAX_SIZE_MB`

### Storage/upload/quota

- `PET_PHOTO_MAX_SIZE_MB`
- `PRODUCT_IMAGE_MAX_SIZE_MB`
- `EXPENSE_FILE_MAX_SIZE_MB`
- `IMAGE_PROCESSING_CONCURRENCY`
- `IMAGE_PROCESSING_MAX_QUEUE`
- `IMAGE_PROCESSING_QUEUE_TIMEOUT_MS`
- `IMAGE_PROCESSING_TIMEOUT_MS`
- `IMAGE_PROCESSING_PER_TENANT`
- `IMAGE_MAX_INPUT_PIXELS`
- `UPLOAD_ENABLE_QUOTAS`
- `UPLOAD_DAILY_BYTES_PER_TENANT`
- `UPLOAD_DAILY_FILES_PER_TENANT`
- `UPLOAD_DAILY_BYTES_PER_USER`
- `UPLOAD_STORAGE_BYTES_PER_TENANT`
- `UPLOAD_SIGNED_URL_TTL_SECONDS`

### Health/readiness

- `READINESS_DATABASE_TIMEOUT_MS`

### Frontend/CORS/CSP

- `CORS_ALLOWED_ORIGINS`
- `PUBLIC_APP_URL`
- `NEXTSTOCK_PUBLIC_URL`
- `PRODUCTION_APP_HOST`
- `NEXTSTOCK_SYSTEM_MODE`
- `NEXTSTOCK_TENANT_TYPE`
- `SYSTEM_MODE`
- `TENANT_TYPE`
- `DASHBOARD_CACHE_MODE`
- `DASHBOARD_CACHE_SINGLE_REPLICA`
- `DASHBOARD_CACHE_TTL_MS`
- `DASHBOARD_CACHE_INVALIDATION_SLA_MS`
- `DASHBOARD_CACHE_MAX_ENTRIES`
- `STOREFRONT_PUBLIC_READ_ENABLED`
- `STOREFRONT_ORDERING_ENABLED`
- `STOREFRONT_TOKEN_SECRET`
- `NEXTSTOCK_DEMO_TENANT_ID`
- `NEXTSTOCK_DEMO_BRANCH_ID`

## Plano de validação para próximas fases

### Validação local mínima

- `npx prisma validate`
- `npm run build`
- `npm run build:frontend`
- `npm test -- --runInBand`
- `npm run test:security`
- `npm run security:static`

### Testes focados por área

- Auth: `npm test -- auth --runInBand` e specs de `src/auth`, `src/users` e provisioning.
- Sessions: `npm test -- sessions --runInBand` e validação de cookies HttpOnly/revogação.
- Storage: specs de `src/storage`, `src/products`, `src/pets`, `src/fiscal` e `src/sales` que cubram upload, signed URL, cleanup e quotas.
- Audit outbox: specs de `src/audit` com idempotência, conflito de payload, claim concorrente e shutdown.
- Upload quota: specs de `src/storage/upload-quota.service` e fluxos que reservam/confirmam/cancelam quota.
- Readiness: specs de `src/observability` e smoke de `/api/health` + `/api/health/ready`.

### Banco/migrations em staging futuro

- Validar migrations desde banco vazio em Cloud SQL staging.
- Validar restore de snapshot/dump sanitizado e execução de migrations pendentes.
- Validar roles/RLS em Cloud SQL staging; se roles Supabase/PostgREST não existirem, documentar substituição segura ou compatibilidade.
- Validar extensões (`pgcrypto` etc.), funções, triggers, views, constraints, locks e SQL raw.
- Validar conexão/pool: limites por réplica, cold starts, timeouts, prepared statements e transações longas.
- Validar readiness com banco compatível e incompatível.

### Rollback e coexistência

- Ensaiar rollback de auth com mapeamento provider/email/profile.
- Ensaiar rollback de banco com PITR/restore ou corte de tráfego.
- Ensaiar leitura de storage antigo e novo durante coexistência.
- Validar que não há dois providers ativos para o mesmo email apontando para perfis diferentes.
- Validar auditoria e trilhas de suporte/Dev SuperAdmin durante transição.

## Backlog técnico detalhado para Fase 1 (não implementar nesta fase)

1. Criar interface `AuthProvider`/`AuthIdentityProvider` com métodos explícitos para login, register, refresh, recovery, verify email, lookup, delete, revoke e logout global.
2. Expandir `UserAuthAdapter` para cobrir login, recovery, criação, lookup, delete e mapeamento de erros sem vazar provider.
3. Adaptar `AuthService` para depender da abstração em todos os fluxos, mantendo endpoints frontend estáveis.
4. Planejar migration append-only para tabela `AuthIdentity` com campos mínimos: `id`, `profileId`, `provider`, `providerUserId`, `canonicalEmail`, timestamps, estado, constraints únicas e trilha de auditoria.
5. Criar política de prevenção de conflito: o mesmo email normalizado não pode existir em dois providers apontando para `UserProfile.id` diferentes.
6. Remover obrigatoriedade global de Supabase quando o provider futuro não for Supabase, sem quebrar storage Supabase enquanto ele existir.
7. Manter cookies atuais até decisão final de Session/cookie domain/CSRF/CORS.
8. Escrever testes mockados de coexistência Supabase/SuperTokens para login, recovery, refresh, logout, delete e fallback controlado.
9. Garantir que tenant/branch/role/system mode continuam autoridade local no PostgreSQL.
10. Preservar rate limit, audit outbox e sessions em todos os fluxos de auth.
11. Criar adapter de Storage (`StorageProvider`) com Supabase e futuro GCS, incluindo signed URLs, metadata, cleanup e quotas.
12. Inventariar buckets/paths existentes e definir estratégia de cópia/validação sem mover dados reais na Fase 1.
13. Definir separação API/worker e configuração de worker único/concorrente por ambiente.
14. Substituir dependências Railway específicas por contratos de deploy portáveis sem remover o deploy atual.
15. Documentar runbooks futuros para Cloud SQL migrations, rollback, readiness e corte de tráfego.

## Critérios de saída da Fase 0

- Documentação criada e revisada.
- Nenhuma migration criada, alterada, resolvida ou aplicada.
- Nenhum runtime behavior alterado.
- Nenhum acesso externo real feito.
- Nenhuma credencial criada ou exposta.
- A readiness offline da Fase 7 está em `platform-auth-storage-decommission-phase-7.md`; Supabase permanece ativo e nenhum cutover foi executado.
- Próximas decisões bloqueantes marcadas como dependentes de documentação oficial.
