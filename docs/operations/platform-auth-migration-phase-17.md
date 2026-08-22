# Fase 17 — Core, rehearsal e operação controlada

Esta fase prepara, mas não ativa, um Core real. O modo padrão continua
`supabase_only` e Supabase Auth/Storage permanecem ativos.

## Rehearsal offline

O arquivo local versionado tem a forma `{ "formatVersion": 1, "records": [] }`.
Cada registro usa `canonicalEmail`, `legacyProvider`, `legacySubject`,
`passwordStrategy` (`import_hash`, `migrate_on_login` ou `reset_required`),
`migrationState`, `plannedResult` e, quando aplicável, `tenantId`, `branchId` e
`roles`. `inventory` só conta estados/bloqueadores. `dry-run` não chama rede nem
escreve banco. A execução real exige uma etapa administrativa futura, confirmação
dupla e permanece bloqueada neste PR. O fake Core deve ser loopback; hosts
externos são proibidos.

## Preflight, canary e rollback

`npm run auth:supertokens:preflight -- --json` produz JSON sem PII e falha
fechado. O canary só seleciona identidades explicitamente elegíveis, tem limite
máximo e kill switch, e nunca promove o modo automaticamente. Rollback retorna a
`supabase_only` ou `coexistence`, bloqueia novas migrações, preserva `AuthIdentity`
e só revoga sessões do Core por decisão explícita.

## Core portátil

`infra/supertokens/docker-compose.rehearsal.yml` é opcional, usa a imagem oficial
fixada `supertokens/supertokens-postgresql:11.0.0`, PostgreSQL 16 separado,
persistência e `/hello`. Secrets vêm apenas do secret manager. Backup, restore e
upgrade exigem parada controlada e restauração do último backup verificado.

## CI real descartável

O job `supertokens_core_real` usa somente localhost, PostgreSQL 16 efêmero e a
imagem oficial `supertokens/supertokens-postgresql:11.0.0`. O banco do Core é
`supertokens_ci`, separado do banco Prisma. A API key é sintética, os testes usam
somente `example.invalid` e o container é removido com `if: always()`. Falhas
imprimem apenas logs sanitizados. A suíte `test/integration/supertokens-core-real.mjs`
valida health, API key, signup/signin, erros não enumeráveis e endpoint de recovery;
fluxos que dependem do SDK (sessão, linking e logout) permanecem gates operacionais
do backend e não são simulados por uma falsa aprovação do Core.

Referências oficiais: [self-hosting/Core](https://supertokens.com/docs/deployment/self-host-supertokens),
[EmailPassword](https://supertokens.com/docs/references/backend-sdks/supertokens-nodejs/recipe-emailpassword),
[Session](https://supertokens.com/docs/post-authentication/session-management/introduction),
[account linking](https://supertokens.com/docs/post-authentication/account-linking/manual-account-linking) e
[migração de hashes](https://supertokens.com/docs/migration/legacy/account-creation/user-creation).
