# Fase 5 — coexistência controlada de Auth (offline)

**FASE 5 APROVADA NÃO SIGNIFICA SUPABASE AUTH DESATIVADO.** Esta implementação prepara o contrato e o modo controlado; não acessa Supabase, Railway, SuperTokens Core, staging ou produção.

## Decisão de sessão

`nextstock_session` continua sendo a única sessão autoritativa do NextStock. Mesmo em uma futura autenticação SuperTokens, o provider apenas autentica e o fluxo local emitirá a sessão existente. Não foi instalado middleware global de sessão SuperTokens, não há segundo cookie, e CSRF/CORS/CSP, JWT/JWKS, logout e revogação permanecem inalterados.

## Modos e adapter

`AUTH_PROVIDER_MODE=supabase_only` é o padrão e não exige variáveis SuperTokens. `coexistence` exige URI, app name e API domain; em produção também exige API key. O modo desconhecido falha fechado. O `FakeSuperTokensAdapter` permite fault injection (`unavailable`, `timeout`, `conflict`) e não inicializa SDK, não chama rede e não persiste senha. O adapter é uma seam de domínio; AuthService, guards, UsersService e frontend não recebem tipos do SDK.

Nesta fase o cadastro e o login Supabase continuam o comportamento ativo. A migração lazy futura deve autenticar primeiro no provider legado, criar tentativa idempotente e persistir somente identidade externa após confirmação; senha nunca deve ser armazenada, logada ou enviada a outbox. Identidade externa será vinculada por `AuthIdentity` e pelo binding `AuthEmailClaim` já existente, preservando `canonicalEmail` único para um `profileId` e permitindo identidades Supabase/SuperTokens do mesmo perfil.

## Canonicalização e segurança

`canonicalizeEmail` agora é a função compartilhada: valida string, trim, Unicode NFC, lowercase determinístico, tamanho e formato. Não aplica regras Gmail, não remove pontos ou aliases e não funde domínios. O `UserProfile.id`, memberships, tenant/branch/roles, RC-009, SEC-016, audit outbox e Storage permanecem autoridades locais/independentes.

## Documentação oficial consultada

- SDK Node e configuração: https://supertokens.com/docs/references/backend-sdks/reference
- EmailPassword (`signIn`, reset e update password): https://supertokens.com/docs/references/backend-sdks/supertokens-nodejs/recipe-emailpassword
- Fastify: https://supertokens.com/docs/nodejs/modules/framework.html
- API overrides: https://supertokens.com/docs/references/backend-sdks/api-overrides

Nenhum `supertokens-node` foi adicionado porque não há Core real nem necessidade de inicializar SDK nesta fase. Account linking/multitenancy pagos não são requisito nem simulados.

## Rollout e rollback

Estágio 0 permanece `supabase_only`; adapter fake roda somente em testes. Core real futuro deve ser ensaiado em staging, com allowlist e observabilidade antes de qualquer marcação `MIGRATED`. Identidades marcadas migradas não sofrem downgrade automático. Rollback imediato desta fase é voltar a `AUTH_PROVIDER_MODE=supabase_only`; a migração de sessão e desativação do Supabase Auth ficam em fases futuras.

**SUPERTOKENS CORE REAL PENDENTE — ATIVAÇÃO DE COEXISTENCE PENDENTE — MIGRAÇÃO DE SESSÃO PENDENTE — DESATIVAÇÃO DO SUPABASE AUTH PENDENTE.**
