# Fase 2 — Preparação offline para PostgreSQL portátil e futuro Cloud SQL

**Status:** preparação offline concluída no repositório; validação e provisioning de
Cloud SQL real pendentes. Não há conta/projeto GCP disponível e nenhum custo foi
assumido. Esta fase não acessa GCP, Railway, Supabase ou banco externo, não migra
dados, não provisiona infraestrutura e não realiza cutover.

## Objetivo, limites e decisões preservadas

O objetivo é comprovar a portabilidade da camada PostgreSQL num PostgreSQL 16
descartável e permitir uma ligação futura por configuração. O banco, deploy Railway,
Supabase Auth/Storage, domínio, tráfego e dados atuais permanecem inalterados. Os
ADRs permanentes da Fase 0 continuam válidos: `UserProfile.id` é a identidade de
negócio (ADR-001); auth não controla tenant/branch/roles (ADR-002); não há dual-write
genérico (ADR-003); storage migra separadamente (ADR-004); workers exigem ownership
explícito (ADR-005). A fundação provider-neutral de auth da Fase 1 também permanece.

## Arquitetura portátil e inventário

- Prisma/NestJS usam PostgreSQL via `DATABASE_URL`; migrations/admin usam
  `DIRECT_URL` ou `ADMIN_DATABASE_URL`.
- `scripts/platform/validate-postgresql-portability.ts` varre deterministicamente a
  cadeia de migrations e inventaria extensions, funções, triggers, views, RLS,
  policies, grants/revokes, índices, enums e constraints SQL. No banco ele comprova
  PostgreSQL >= 16, roles, extensions, `gen_random_uuid()`, marcador REL-016,
  advisory locks e `FOR UPDATE SKIP LOCKED` com duas conexões.
- O relatório JSON mostra somente host/porta/database sanitizados, contagens e
  requisitos; usuário, senha, query string e tokens nunca são impressos.
- SQL raw runtime, isolation `ReadCommitted`, constraints e claims concorrentes
  continuam cobertos pelas suítes RC-001..RC-015, SEC-016, MEM-016 e AUD-016.

### Roles legadas e privilégios

`scripts/platform/bootstrap-legacy-database-roles.sql` cria idempotentemente `anon`,
`authenticated` e `service_role`. São identidades históricas exigidas pelas policies,
não uma reprodução administrativa do Supabase: todas são `NOLOGIN`, `NOSUPERUSER`,
`NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, `NOBYPASSRLS`, sem senha
e sem grants adicionais. O entrypoint antigo do CI é preservado e inclui o bootstrap
comum. As policies históricas continuam definindo apenas seus privilégios de tabela.

### Extensions, funções e migrations vazias

O inventário deriva extensions da cadeia (atualmente `pgcrypto`) e executa
`gen_random_uuid()`/UUID de verdade. Funções customizadas, triggers, views, policies,
tipos, enums e índices são conferidos no inventário e criados pela cadeia imutável.
No CI: PostgreSQL 16 vazio → bootstrap duas vezes → `prisma migrate deploy` →
`prisma migrate status` → validador. Não são usados `db push`, `migrate resolve` ou
edição de `_prisma_migrations`; nenhuma migration histórica foi alterada.

## Readiness, concorrência e workers

`/api/health` permanece liveness sem banco. `/api/health/ready` mantém exatamente a
semântica REL-016: schema ausente/parcial ou banco indisponível retorna 503 sanitizado
dentro do timeout; cadeia completa e marker 1 retorna 200. O CI mantém os testes de
ausência, incompatibilidade, sucesso, indisponibilidade/timeout e não vazamento.

Os testes PostgreSQL existentes usam dois `PrismaClient`/duas instâncias e barreiras
reais nos lotes 2/20/100. RC-015 cobre a chave advisory determinística no serviço,
serialização, commit/rollback e concorrência sem memória local; o validador adiciona
prova independente de duas sessões/chaves. Claims com `SKIP LOCKED` são exercitados
por audit outbox, webhook inbox, auth rate-limit e upload quota. RC-013/AUD-016 cobrem
unique identity, concorrência, retry, `FAILED_FINAL`, backlog/lag, rollback, shutdown e
alertas sanitizados. SEC-016 cobre contador compartilhado, IP/conta, IPv4/IPv6,
forwarded headers, janela/expiração, restart lógico, 429 e `Retry-After`. RC-008 e
MEM-016 cobrem reserva atômica, bytes/arquivos, confirm/release, timeout/lease,
rollback, isolamento tenant e paths tenant-scoped. Os clientes são desconectados nos
teardowns e cleanup respeita FKs.

## Variáveis futuras (opcionais agora)

`DATABASE_PROVIDER`, `CLOUD_SQL_INSTANCE_CONNECTION_NAME`, `CLOUD_SQL_CONNECTOR_MODE`,
`GCP_PROJECT_ID`, `GCP_REGION` e `CLOUD_SQL_DATABASE` são somente documentação de
configuração futura. Credenciais pertencerão ao Secret Manager e workload usará OIDC/
Workload Identity, nunca chave JSON versionada. URLs runtime/admin seguem separadas;
porta 6543 e `pgbouncer=true` são proibidos para migrations em qualquer hostname.

## Runbook futuro de staging (não executar nesta fase)

1. Criar projeto com billing aprovado, região definida e budget/alertas revisados.
2. Provisionar Cloud SQL PostgreSQL 16 **staging**, IP público desabilitado, backups e
   PITR conforme RPO/RTO; usar private networking e Auth Proxy/Connector.
3. Criar database/usuário runtime e usuário admin distintos no Secret Manager, sem
   chave JSON; limitar conexões/pool por réplica.
4. Ligar uma única task/job de migrations à conexão admin, executar o bootstrap,
   `npm run db:migrate:deploy`, `npx prisma migrate status` e o validador.
5. Configurar runtime com `DATABASE_URL`; executar readiness, smoke tests e as suítes
   concorrentes com duas instâncias antes de qualquer tráfego.
6. Ensaiar rollback: parar writes/tráfego, retornar ao endpoint anterior consistente,
   verificar marker/readiness e reconciliar somente pelo plano aprovado. Não usar
   dual-write genérico. Storage continua separado.
7. Ensaiar teardown de staging: reter evidências sanitizadas necessárias, confirmar
   política de backup/PITR, remover instância/rede/secrets temporários e verificar
   encerramento de custos.

Não foi criado template IaC: sem conta e sem topologia aprovada, um template agora
seria prematuro e poderia cristalizar decisões inseguras. A Fase 3 deve registrar plano,
extensões suportadas, latência, limites de conexão, failover, PITR, proxy/connector,
custos e evidências reais. Riscos ainda não comprovados incluem comportamento gerido,
quotas, manutenção, failover, rede privada, IAM, performance e restore realista.

## Checklist para a Fase 3

- [ ] criar conta/projeto GCP;
- [ ] habilitar billing;
- [ ] definir região;
- [ ] criar Cloud SQL PostgreSQL 16 staging;
- [ ] configurar conexão segura;
- [ ] inserir secrets no Secret Manager;
- [ ] criar roles;
- [ ] aplicar migrations;
- [ ] executar validador;
- [ ] executar readiness;
- [ ] executar testes concorrentes;
- [ ] revisar custos;
- [ ] ensaiar teardown;
- [ ] registrar evidências reais.

## Declaração de alcance

“FASE 2 OFFLINE APROVADA não significa que Cloud SQL real foi provisionado ou
validado. Significa que o repositório, os scripts, os guardrails e os testes PostgreSQL
foram preparados para a futura ligação.” A aprovação só pode ser declarada após todo
o CI obrigatório ficar verde; até lá, o status operacional é **FASE 2 OFFLINE PENDENTE**.
