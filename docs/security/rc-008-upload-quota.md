# RC-008 — reservas atômicas de quota de upload

## Baseline e levantamento

O baseline local desta correção é `03164b66f3fbd214dcea9c606c472f9449fe8c3a`. Ele contém a sequência integrada RC-001 a RC-007, terminando em `fix(orders): make status transitions atomic (RC-007)`.

A implementação anterior de `UploadQuotaService.assertAllowed` fazia quatro leituras em paralelo e decidia em memória:

1. soma e contagem diária de `StoredFile` por tenant;
2. soma diária de `StoredFile` por tenant e proprietário, quando presente;
3. soma de bytes de `StoredFile` ativo por tenant;
4. leitura de `Tenant.currentPlan.features`, origem dos limites customizados.

Depois dessas consultas, o objeto externo era criado pelo adapter Supabase e somente depois cada variante era registrada em `StoredFile`. O registro de domínio (`ProductImage`, `ExpenseFile` ou `PetPhoto`) era criado ainda mais tarde pelo serviço chamador. Assim, produto, despesa e foto de pet passavam por `assertAllowed`, mas continuavam sujeitos a check-then-act. XML/PDF fiscal e o storage separado de certificado A1 não chamavam `assertAllowed`; XML/PDF agora usam o mesmo protocolo. O certificado A1 continua fora desta quota porque usa contrato, bucket e persistência fiscal próprios e nunca integrou a quota de `StoredFile`.

## Dimensões e limites reais

Os contadores persistem os três escopos já existentes:

- `TENANT_TOTAL`: bytes ativos; limite em `Plan.features.uploadStorageBytes`, depois `UPLOAD_STORAGE_BYTES_PER_TENANT`, fallback 5 GiB;
- `TENANT_DAILY`: bytes e arquivos criados no dia UTC; limites em `Plan.features.uploadDailyBytes` / `uploadDailyFiles`, depois as envs `UPLOAD_DAILY_BYTES_PER_TENANT` / `UPLOAD_DAILY_FILES_PER_TENANT`, fallbacks 500 MiB e 200;
- `USER_DAILY`: bytes no dia UTC; `UPLOAD_DAILY_BYTES_PER_USER`, fallback 100 MiB.

Limites básicos por arquivo continuam no adapter: 5 MiB para foto de pet e imagem de produto, 10 MiB para anexo de despesa. Limites de cardinalidade do alvo (três imagens/fotos, cinco anexos ativos) permanecem nos serviços de domínio e não substituem a quota global.

## Protocolo

1. O adapter valida tipo, assinatura, tamanho e otimiza imagens sem rede.
2. O servidor gera UUID, bucket/path tenant/branch-scoped e calcula os bytes efetivamente produzidos.
3. `reserve` cria a intenção idempotente e incrementa condicionalmente todos os contadores numa transação curta. A ordem é sempre total do tenant, diário do tenant e diário do usuário. Qualquer `UPDATE` que não altere exatamente uma linha aborta tudo.
4. Depois do commit, o adapter envia ao Storage.
5. `StoredFile` é persistido e associado à reserva.
6. `confirm` troca `RESERVED` por `CONFIRMED` e move reservado para confirmado na mesma transação, somente uma vez.
7. Falha sabidamente pré-rede permite `release`; erro após início da chamada externa ou após upload marca `RECONCILIATION_REQUIRED` e preserva os object keys. Não há liberação cega.
8. Remoção muda apenas arquivos ainda `ACTIVE` e reduz o contador total na mesma transação; retries não decrementam novamente. Contadores diários não diminuem, preservando a regra histórica de consumo diário por upload realizado.

A chave `(tenant_id, idempotency_key)` é única. O hash inclui tenant, filial, usuário, bytes, quantidade e object keys: repetir a mesma intenção retorna a reserva; reutilizar a chave com path ou metadados divergentes retorna HTTP 409. Quota excedida continua HTTP 413 e ocorre antes do adapter. Metadados inválidos continuam HTTP 400 nos endpoints.

## Paths, isolamento e recuperação

Object keys são produzidas no servidor, começam obrigatoriamente com `<tenantId>/`, incluem branch e alvo quando aplicável, reutilizam o path persistido na reserva e rejeitam `..`, barra invertida e namespace estrangeiro. FKs compostas impedem branch ou membership de outro tenant na reserva.

`claimExpired` usa lote limitado e `FOR UPDATE SKIP LOCKED`, marcando a reserva `EXPIRED` sem liberar bytes. `reconcileExpiredBatch` consulta fora da transação de claim: um `StoredFile ACTIVE` associado é confirmação autoritativa local; sem registro local, a reserva vai para `RECONCILIATION_REQUIRED`. O adapter atual não oferece consulta autoritativa de existência externa, portanto a recuperação deliberadamente não inventa essa API nem conclui que ausência local significa ausência no bucket.

A migration é append-only, cria enums, contadores, reservas, constraints não negativas/de capacidade, índices, FKs tenant-scoped e faz backfill de total, dia corrente e usuário/dia. `SecurityAuditEvent` não é alterado nem removido.
