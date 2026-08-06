# Fase 3 — preparação offline para Cloud Run

Status: offline. Nenhum projeto, billing, Cloud Run, Cloud SQL, Railway, Supabase ou dado real foi acessado.

## Arquitetura

`NEXTSTOCK_PROCESS_ROLE=api` inicia somente a API em `0.0.0.0:$PORT`; `audit-worker` inicia o contexto mínimo Prisma + outbox; `all` preserva o Railway atual. Role inválida falha antes do bootstrap. O worker é um Job de lote: mantém `FOR UPDATE SKIP LOCKED`, leases, fencing, retry, `FAILED_FINAL`, métricas de backlog/lag e shutdown existentes, e é seguro em concorrência.

Migration é um job separado: exige `DIRECT_URL` ou `ADMIN_DATABASE_URL`, rejeita pooler 6543/pgbouncer, valida alvo, executa deploy/status e nunca inicia API/worker. A API nunca executa migration no startup.

## Runtime, saúde e dados

O Dockerfile é multi-stage, usa Node 22, `npm ci`, Prisma generate, builds e usuário não-root. `/api/health` permanece liveness simples; `/api/health/ready` mantém REL-016 e retorna 503 para schema incompatível/indisponível. Shutdown hooks do Nest fecham Fastify, Prisma, worker e timers.

Supabase Auth, JWT/JWKS, cookies, recovery/refresh/logout, Storage, buckets, signed URLs e paths tenant-scoped permanecem inalterados. Cloud SQL é apenas configuração futura; `DATABASE_URL` runtime e `DIRECT_URL`/`ADMIN_DATABASE_URL` administrativo permanecem.

Templates estão em `infra/gcp/cloud-run/`. CI usa PostgreSQL 16 e não exige GCP. Railway pode continuar com `start:railway` e `all`; rollback é reversão do PR, sem migration de dados.

## Ativação futura (Fase 4)

Criar projeto/billing/região, Artifact Registry, imagem, service accounts/Workload Identity, Secret Manager, Cloud SQL staging, executar migration job, worker e API; validar readiness e Supabase Auth/Storage; executar smoke/rollback e somente então considerar tráfego. IAM, custos e DNS não são assumidos nesta fase.
