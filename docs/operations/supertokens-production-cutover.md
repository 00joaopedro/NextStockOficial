# SuperTokens — runbook de prontidão e cutover futuro

Este documento é um plano executável, não evidência de migração. Neste PR não
foram acessados serviços reais, usuários reais ou hashes reais. `supabase_only`
continua sendo o padrão; Supabase Auth não foi removido.

## Pré-requisitos e arquitetura

O Core deve usar a imagem oficial fixada por versão/digest e PostgreSQL 16
isolado do banco NextStock. URI, API key, credenciais do banco e certificados
devem vir de Secret Manager. Antes de qualquer ativação, validar backup/restore,
TLS no proxy, limites de conexão, healthcheck `/hello`, readiness, shutdown e
rotação de API key em staging. Nunca compartilhar tabelas do Core com Prisma.

## Sequência controlada

1. Em staging, registrar inventário agregado e executar
   `npm run auth:supertokens:preflight -- --json`.
2. Executar `auth:supertokens:inventory`, migration-plan com `--dry-run` e
   `auth:supertokens:reconcile -- --dry-run`; todos devem ser sem PII e sem
   mutações. Corrigir cada `blockerCode` antes de avançar.
3. Ativar coexistência e um canário sintético/allowlist de 1%, por no mínimo
   24 horas, observando sucesso, falha, fallback, Core indisponível/timeout,
   recovery, logout global, conflitos, reconciliação, latência e auditoria.
4. Pausar e voltar imediatamente a `coexistence` se houver outage, erro de
   recovery/logout, conflito, backlog de reconciliação, falha de auditoria ou
   degradação acima do SLA aprovado. O kill switch deve prevalecer.
5. `supertokens_primary` só pode ser escolhido após aprovação humana do
   canário, rollback ensaiado e evidências de sessão, recovery e isolamento.
6. `supertokens_only` só pode ser escolhido após 100% das identidades, hashes ou
   reset, sessões e recovery comprovados, zero pendências/conflitos e aprovação
   humana. Não é concluído por este PR.

## Rollback e segurança

Rollback é uma mudança explícita para `coexistence`, preservando `UserProfile`,
`AuthIdentity`, sessões e auditoria; não converter cookies Supabase/JWT em
cookies SuperTokens. Fallback só é permitido para identidade LEGACY. Não
vincular por e-mail ambíguo: conflito exige reconciliação.

## Evidências e responsáveis

Guardar versão/digest, backup/restore, saída JSON sanitizada, contagens antes e
depois, checks de recovery/logout, métricas agregadas, janela de observação,
decisão do responsável de autenticação, segurança, dados e operação. Labels de
métricas não podem conter e-mail, subject, token, hash ou tenant identificável.

Passos ainda humanos: provisionar Core persistente e PostgreSQL isolado,
configurar DNS/TLS/secrets/backups, executar staging real, importar ou migrar
senhas conforme estratégia aprovada, validar tráfego canário e decidir cada
promoção. Nenhum desses passos foi simulado como concluído.
