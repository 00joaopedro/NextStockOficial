# Fase 6 — fundação de migração Storage (offline)

**FASE 6 OFFLINE APROVADA NÃO SIGNIFICA QUE OBJETOS REAIS FORAM MIGRADOS.** Supabase Storage permanece provider padrão; GCS real está desativado, nenhum bucket foi criado e nenhum objeto foi acessado. **GCS REAL PENDENTE — MIGRAÇÃO REAL DE OBJETOS PENDENTE — ATIVAÇÃO DE NOVOS UPLOADS NO GCS PENDENTE — DESATIVAÇÃO DO SUPABASE STORAGE PENDENTE.**

## Contrato e rollout

`StorageProvider` usa locator (`provider`, bucket lógico, objectKey e generation), metadata, tamanho e SHA-256; URL assinada é temporária e nunca é identidade persistida. `StorageProviderRegistry` mantém `SUPABASE`/`GCS` explícitos, com Supabase como default e GCS bloqueado sem flag/configuração. Os serviços legados continuam usando `SupabaseStorageService`, sem regressão; a adoção do contrato deve ocorrer por categoria revisada.

O `FakeStorageProvider` simula streams, metadata, generation, create-only, existência, signed URL, faults e não faz rede. O gerador de chaves exige tenant, branch quando aplicável, categoria e UUID opaco; rejeita traversal, separadores e controle. O parser de locators Supabase aceita apenas origin conhecida, sem query/signed URL, e classifica ambiguidades para reconciliação.

Uploads continuam Supabase, com quota RC-008, scanner, MEM-016, variantes e audit outbox preservados. Downloads não aceitam provider vindo da request. Um futuro worker deverá claimar objetos com PostgreSQL/`SKIP LOCKED`, lease, claimToken e CAS; somente após head, bytes e SHA-256 conferirem poderá ativar o locator GCS. A origem permanece para rollback e não há dual-write.

## GCS futuro

Não foi adicionado `@google-cloud/storage` nesta fase para evitar SDK/Core/rede obrigatórios. A implementação futura deve usar Node 22, Application Default Credentials/Workload Identity no Cloud Run, bucket privado com uniform bucket-level access, preconditions de generation (`ifGenerationMatch`), retries/timeouts limitados, CRC32C como metadata auxiliar e SHA-256 como hash canônico. Signed URLs devem ser V4, curtas e somente leitura. Referências oficiais: [client Node](https://cloud.google.com/nodejs/docs/reference/storage/latest), [signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls), [V4](https://cloud.google.com/storage/docs/access-control/signing-urls-with-helpers), [uniform bucket-level access](https://cloud.google.com/storage/docs/uniform-bucket-level-access), [IAM](https://cloud.google.com/storage/docs/access-control/iam).

## Configuração, segurança e rollback

`STORAGE_WRITE_PROVIDER=supabase`, `GCS_STORAGE_ENABLED=false` e `STORAGE_MIGRATION_ENABLED=false` são defaults. GCS selecionado sem project/bucket falha fechado. Não versionar service account JSON; preferir Workload Identity. URLs legacy são apenas preflight/reconciliação, nunca reescritas automaticamente.

Rollback futuro retorna o write provider a Supabase, mas locators já ativados em GCS continuam sendo lidos pelo provider persistido. A origem não deve ser apagada até retenção, validação e aprovação humana. Não executar delete destrutivo ou rollback automático.

## Checklist futuro

- [ ] Aprovar projeto/billing, IAM, bucket privado, região e retenção.
- [ ] Ensaio com fixtures e PostgreSQL 16 descartável; validar counts, bytes, SHA-256 e variantes.
- [ ] Ativar GCS apenas por allowlist/categoria em staging futuro.
- [ ] Validar quota, scanner, backpressure, tenant/branch e signed URLs V4.
- [ ] Migrar pequenos lotes com lease/CAS; preservar origem.
- [ ] Observar mismatches/backlog e somente depois parar novos uploads Supabase.
- [ ] Aprovar retenção, delete posterior e rollback humano.
