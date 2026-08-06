# Fase 4 — PostgreSQL cutover readiness (offline)

**FASE 4 OFFLINE APROVADA NÃO SIGNIFICA CUTOVER REAL EXECUTADO.** Este kit prepara e ensaia o fluxo futuro; não acessa Supabase, Railway, Cloud SQL, Cloud Run ou dados reais. **CUTOVER REAL PENDENTE.**

## Escopo e decisões

PostgreSQL continua autoridade dos dados, Supabase Auth/Storage continuam temporários, não há dual-write, CDC ou DMS, e as decisões das Fases 0–3 (identidade `UserProfile.id`, identidades externas separadas, workers com ownership, migrations append-only e readiness REL-016) permanecem. A estratégia futura é `pg_dump` custom, downtime controlado, `pg_restore`, validação e troca de `DATABASE_URL`; DMS/CDC é somente alternativa documental após billing, conectividade e ensaio aprovados.

## Kit offline

Os módulos em `scripts/platform/postgres-cutover/` validam URLs distintas, protocolo, ambiente protegido, dry-run padrão e confirmação explícita. Identidades exibem somente host/porta/database; senhas, usuários e query strings nunca entram em planos ou relatórios. `platform:cutover:preflight`, `platform:cutover:dump-plan` e `platform:cutover:restore-plan` apenas geram planos: não executam dump, restore, migration, `db push` ou `migrate resolve`.

O dump futuro usará formato custom, `--no-owner`, `--no-acl`, arquivo temporário, checksum SHA-256 e PGPASSFILE temporário com cleanup. O restore exigirá destino previamente confirmado vazio, checksum, `--exit-on-error`, `--no-owner` e `--no-acl`. Nenhuma senha será passada na linha de comando.

Antes do GO futuro, verificar versão PostgreSQL, migrations/marker, tabelas, colunas, tipos, enums, constraints, índices, views, funções, triggers, extensões, RLS/policies, contagens, checksums canônicos e sequences catalogadas. O drain deve bloquear qualquer lease/claim `PROCESSING` ativo, backlog não drenado, reservation/claim vencido não reconciliado ou worker habilitado; o código de negócio não é alterado nesta fase.

## Operação futura

1. Aprovar janela, responsáveis, backup e downtime.
2. Retirar tráfego, parar API/workers e congelar origem.
3. Executar preflight, dump final, checksum e restore no destino vazio.
4. Validar schema/migrations/readiness, counts, checksums e sequences.
5. Trocar secret/DATABASE_URL, subir API/worker e observar health/readiness.

Rollback não é automático: parar destino, restaurar secret anterior, validar origem e reabrir tráfego somente enquanto não houver novas escritas no destino. Após novas escritas, voltar a URL pode perder dados.

## Variáveis e checklist

Use `CUTOVER_SOURCE_ADMIN_DATABASE_URL`, `CUTOVER_TARGET_ADMIN_DATABASE_URL`, `CUTOVER_DRY_RUN=true`, `CUTOVER_ALLOW_PRODUCTION=false`, `CUTOVER_CONFIRMATION_TOKEN`, `CUTOVER_REPORT_PATH` e timeout. Nunca versionar URLs, dumps, PGPASSFILE, checksums reais ou relatórios reais.

- [ ] Conta Google Cloud, billing, Cloud SQL, IAM e conectividade aprovados.
- [ ] Ensaio PostgreSQL 16 com volume representativo e backup verificado.
- [ ] Preflight origem/destino e drain sem blockers.
- [ ] Dump/restore, checksum, counts, sequences e readiness aprovados.
- [ ] Secret/DATABASE_URL e rollback aprovados humanamente.
- [ ] Cloud Run API/worker/migration separados e smoke test concluído.

O CI usa dois PostgreSQL 16 descartáveis para validar o workflow sintético. A ausência de conta/billing permanece bloqueadora para qualquer cutover real.
