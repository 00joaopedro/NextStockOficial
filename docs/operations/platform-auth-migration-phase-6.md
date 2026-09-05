# Fase 6 — migração gradual e coexistência segura

Esta fase prepara a migração; não executa migração em Railway, Supabase,
staging ou produção. `AUTH_PROVIDER_MODE=coexistence` continua sendo requisito
e `local_primary`/`local_only` permanecem proibidos.

## Flags

Todos os defaults são seguros: `AUTH_MIGRATION_ENABLED=false`,
`AUTH_MIGRATION_JIT_ENABLED=false`, `AUTH_MIGRATION_BATCH_ENABLED=false` e
`AUTH_MIGRATION_DRY_RUN=true`. O source permitido é `supabase` ou
`supertokens`; batch tem limite de 100 registros. Apply exige confirmação
explícita, mas esta fase fornece apenas o planejamento dry-run.

## JIT e ledger

Após autenticação legada bem-sucedida, o JIT opcional reivindica um registro
por hash do subject, profile e tipo. A senha permanece somente em memória até
ser validada pelo provider legado; somente então o hash local oficial é criado
na mesma transação que a identidade e o ledger. Claims usam versão/token e
claims vencidos podem ser retomados. Falhas são marcadas por código sanitizado;
o fallback legado permanece disponível.

O ledger não armazena senha, hash, token, email ou subject puro. O subject é
usado pelo provider apenas para a constraint de identidade e seu hash é usado
no ledger.

## Batch, observabilidade e rollback

O batch inicia em dry-run, aceita somente entrada sanitizada e produz contagens
sem PII. Não há deleção da origem nem conversão de sessões. Rollback consiste
em desligar as flags, parar o batch e manter o provider legado; identidades e
credenciais já migradas não são apagadas automaticamente. Estados `unknown`
exigem reconciliação antes de retry.

PR 7 e PR 8 exigem evidência real de cobertura, conflitos, falhas, fallback,
sessões e ensaio em PostgreSQL descartável. Nenhuma evidência de produção é
declarada por este PR.
