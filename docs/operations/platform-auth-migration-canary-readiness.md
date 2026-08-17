# SuperTokens — canary readiness runbook

Este PR prepara um canário sintético, mas não ativa produção, não acessa
Supabase/Railway/GCP reais e não migra usuários reais. O padrão permanece
`AUTH_PROVIDER_MODE=supabase_only`; `supertokens_only` continua bloqueado.

## Arquitetura e dependências

O Core 11.0.0 validado roda separado do PostgreSQL do NextStock. O compose em
`infra/supertokens/docker-compose.rehearsal.yml` usa PostgreSQL 16, volume
persistente, `/hello`, restart policy e limites de 1 CPU/512 MiB por serviço.
Para qualquer ambiente não descartável, substituir a tag por um digest
registrado e aprovado, sem versionar credenciais. O Core não compartilha
tabelas com Prisma.

Referências oficiais consultadas em 2026-08-16:

- https://supertokens.com/docs/deployment/self-host-supertokens — Core 11 e PostgreSQL >= 13;
- https://supertokens.com/docs/references/backend-sdks/supertokens-nodejs/recipe-emailpassword — EmailPassword e recovery;
- https://supertokens.com/docs/post-authentication/session-management/introduction — criação e revogação de sessões;
- https://supertokens.com/docs/migration/legacy/account-creation/user-creation — importação BCrypt/Argon2 e migração durante login;
- https://supertokens.com/docs/post-authentication/account-linking/manual-account-linking — linking explícito.

O backend atual mantém a sessão local `nextstock_session`; não converte cookies.
Logout e logout global continuam passando pelo serviço de sessões local e pelo
provider aplicável. Tenant, branch, roles e memberships continuam autoritativos
no PostgreSQL do NextStock.

## Secrets, startup e operação

Fornecer `SUPERTOKENS_CONNECTION_URI`, `SUPERTOKENS_API_KEY`,
`SUPERTOKENS_DB_USER`, `SUPERTOKENS_DB_PASSWORD` e `SUPERTOKENS_DB_NAME` apenas
por secret manager. Iniciar o banco, aguardar healthcheck, iniciar Core e
aguardar `GET /hello`; o backend só deve avançar após readiness. Backup lógico
ou base verificado antes de upgrade; upgrade segue migrations sequenciais da
release; restore exige parada controlada e validação de `/hello` e rehearsal.
Shutdown deve remover o container e o volume só quando o ambiente for
descartável.

## Canário e rollback

`AUTH_CANARY_ALLOWLIST` recebe IDs sintéticos explícitos; `AUTH_CANARY_PERCENTAGE`
é determinístico por hash SHA-256 do ID estável; email nunca é selector ou label.
`AUTH_CANARY_KILL_SWITCH=true` força legado. A política rejeita flags
contraditórias. Fallback só é permitido para identidade marcada LEGACY e o
rollback é imediato para `coexistence` ou `supabase_only`, preservando
`AuthIdentity` e sem apagar sessões/identidades automaticamente.

Comandos:

```text
npm run auth:supertokens:canary-check -- --json
npm run auth:supertokens:cutover-check -- --json
npm run auth:supertokens:rehearsal -- fixtures/synthetic.json --inventory
```

O primeiro bloqueia Core/configuração/recovery/observabilidade/fallback,
selector inválido e `supertokens_only`. O segundo é deliberadamente mais
rigoroso e sempre bloqueia `supertokens_only` neste estágio; também exige zero
pendências de identidade, reconciliação, senha e sessão. Os contadores de
preflight atuais são uma interface provisória para CI; a promoção futura deve
substituí-los por consultas autoritativas ao PostgreSQL.

## Migração e senhas

O rehearsal offline é idempotente e fail-closed: canonicaliza, inventaria,
detecta duplicidades e não grava senha/hash nem chama rede. BCrypt/Argon2 podem
usar a API oficial de importação; sem hash, usar migração durante login ou
`reset_required`. Falha entre criação e vínculo deve marcar
`RECONCILIATION_REQUIRED`; retry deve ser explícito e seguro. Nenhuma execução
administrativa real está habilitada neste PR.

## Gates, observabilidade e critérios

Gates bloqueiam Core indisponível/incompatível, recovery não validado,
observabilidade/fallback ausentes, duplicidade, reconciliação, sessão fora da
janela, configuração contraditória e segredo ausente. Eventos devem conter
somente resultado, modo, provider, estado e latência agregável; nunca email,
senha, hash, token, cookie, API key ou subject bruto.

Promover a `supertokens_primary` exige canary sintético verde, recovery,
logout, sessões, linking concorrente, isolamento tenant/branch e rollback
ensaiado. `supertokens_only` exige adicionalmente zero pendências em todas as
identidades/senhas/sessões/recovery e uma decisão operacional posterior; não é
aprovado por este PR.

## Limitações e confirmação

CI valida Core oficial descartável e PostgreSQL 16. Ainda dependem de
infraestrutura real: digest final, secret manager, backups/restores operacionais,
alertas, rollout gradual e validação de tráfego real controlado. Nenhum
cutover ocorreu, Supabase Auth não foi desativado e nenhum serviço ou usuário
real foi acessado.

