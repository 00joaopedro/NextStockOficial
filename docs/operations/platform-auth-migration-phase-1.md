# Fase 1 — fundação provider-neutral de autenticação

## Decisões e limites

Esta fase preserva ADR-001 a ADR-005 da Fase 0. `UserProfile.id` continua sendo
a identidade de negócio; tenant, filial, papéis, memberships, `SystemType` e
`SystemMode` permanecem sob autoridade do PostgreSQL local. Não há SuperTokens,
acesso a providers reais, migração operacional, mudança de JWT/cookies, storage,
workers ou dual-write.

`AUTH_PROVIDER` aceita exclusivamente `supabase` e tem esse valor como default
compatível. Qualquer outro valor falha no bootstrap sem imprimir seu conteúdo ou
segredos. Supabase Storage continua no `SupabaseModule`: selecionar Auth não muda
buckets, objetos ou credenciais de Storage. A separação completa da inicialização
dos clientes será feita quando existir um segundo adapter funcional; nesta fase o
mesmo SDK permanece inicializado para preservar Auth e Storage.

## Contrato e erros

`AuthIdentityProvider` cobre criação, login, refresh, recovery, verificação de
email, lookup por ID/email, compensação, revogação, logout e obtenção da identidade
autenticada. O único adapter é `SupabaseAuthProvider`. Tipos do SDK não atravessam
o contrato. Erros são classificados em códigos estáveis e respostas públicas não
incluem mensagens, tokens ou payloads do provider.

## Identidade e concorrência

`auth_email_claims` possui chave primária em `canonical_email` e vínculo único ao
perfil. Assim, providers diferentes só podem coexistir para o mesmo perfil; uma
disputa concorrente por email tem um único vencedor no banco. `auth_identities`
impõe unicidade de `(provider, provider_user_id)`, `(provider, profile_id)` e
`(provider, canonical_email)`. Nenhum mutex em memória é usado.

A canonicalização é somente `trim` + lowercase, seguida da validação estrutural já
usada pela camada de auth. Pontos e aliases `+` não são removidos.

## Backfill e rollout

A migration append-only usa apenas `profiles.supabase_user_id`. Ela cria claims e
identidades somente quando o email case-insensitive identifica exatamente um
perfil; casos ambíguos ou perfis sem ID determinístico ficam para reconciliação.
Ela não consulta Supabase e não inventa IDs.

Antes de produção: aplicar em PostgreSQL 16 descartável/staging com `prisma migrate
deploy`, auditar os casos não preenchidos, executar as suítes de auth, RC-009,
SEC-016, sessions, audit outbox, JWT/JWKS e storage e só então promover. Migrations
continuam fora do boot e devem usar o job controlado existente.
