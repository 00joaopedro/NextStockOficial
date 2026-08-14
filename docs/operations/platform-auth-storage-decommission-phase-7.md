# Fase 7 — readiness para desativação futura de Auth e Storage

**FASE 7 OFFLINE APROVADA NÃO SIGNIFICA CUTOVER REAL EXECUTADO.**

Esta fase é somente preparação offline. Supabase Auth e Supabase Storage
continuam ativos e são os providers padrão. SuperTokens e GCS não são acessados,
necessários ou ativados por variável isolada.

## Gates

`AUTH_CUTOVER_MODE` e `STORAGE_CUTOVER_MODE` permanecem em
`supabase_primary`. Os modos finais exigem provider configurado, relatório
recente, zero blockers, readiness e aprovação operacional explícita.

`npm run platform:decommission:validate` é somente leitura, dry-run por padrão e
retorna exit code diferente de zero com blockers. O relatório é sanitizado e
marca `realCutoverApproved: false`.

## Auth

`UserProfile.id` continua sendo identidade de negócio e `AuthIdentity` mantém
providers externos separados. Tenant, branch, roles, memberships, cookies e
`nextstock_session` continuam locais. Colisões de canonicalEmail, vínculos
ambíguos, recovery não comprovado, compensação pendente e sessões Supabase
ativas bloqueiam `supertokens_only`. Nenhum hash de senha é importado.

## Storage

O registry da Fase 6 mantém Supabase como default e GCS desativado sem
configuração. Provider, bucket e path tenant-scoped identificam o objeto; signed
URLs continuam derivadas pelo backend. Objetos Supabase-only, cópia pendente,
claims/reservations pendentes, hash/size mismatch, target ausente e path inválido
bloqueiam `gcs_only`. Não há dual-write genérico.

## Cutover e rollback futuro

Validar infraestrutura, migrar e reconciliar identidades, testar login/recovery/
logout, migrar objetos e comparar count/bytes/hash/metadata/ownership. Depois
gerar relatório, revisar blockers, aprovar explicitamente e ativar um domínio por
vez. Rollback é manual e separado: Auth deve tratar sessões e identidades novas;
Storage deve considerar objetos gravados somente no GCS. Nunca trocar apenas uma
URL após novas escritas sem avaliar perda de dados.

Ainda são necessários SuperTokens/GCS reais, ensaio representativo, recuperação
comprovada, janela de manutenção, responsáveis e aprovação humana. Nenhum
serviço Supabase foi desativado nesta fase.
