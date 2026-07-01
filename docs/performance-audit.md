# Auditoria de performance do NextStock

Data: 2026-06-30

Escopo: NestJS, TypeScript, Prisma, PostgreSQL/Supabase, Railway e frontend
HTML/CSS/JavaScript. Mudança de região entre Railway e Supabase foi
explicitamente excluída.

## A. Diagnóstico geral

### Crítico

- Imagens de produtos e pets são enviadas ao Storage no formato e tamanho
  originais. O backend confia no MIME declarado pelo cliente, não decodifica o
  arquivo, não remove EXIF, não redimensiona, não gera WebP nem thumbnail e não
  limita dimensões/pixels.
- Os interceptors de upload usam memória sem `limits` do Multer. O limite é
  verificado somente depois de o arquivo já estar inteiramente em RAM.
- `ProductImage` e `PetPhoto` não guardam MIME, tamanho, dimensões, tamanho
  otimizado ou caminho de thumbnail. Isso impede selecionar a variante correta
  e medir a economia.

### Alto

- O dashboard do frontend chama quatro endpoints (`summary`, `charts`,
  `top-products` e `alerts`) embora o backend já possua `GET /dashboard`
  agregado. Isso repete autenticação/contexto e consultas.
- A listagem de produtos usa apenas `take`, sem `page`, `skip` ou cursor. Não há
  paginação real nem total, e o frontend não consegue navegar corretamente.
- Listagens de produtos retornam todas as imagens e depois resolvem URLs com
  `Promise.all`. Com bucket privado, isso vira uma chamada remota de URL
  assinada por imagem.
- As buscas usam extensivamente `contains` + `insensitive`. Índices B-tree de
  `name`, `email` etc. não aceleram padrões `%texto%`; é necessário validar
  `pg_trgm`/GIN com `EXPLAIN (ANALYZE, BUFFERS)`.
- O dashboard executa várias agregações sobre vendas/itens. O subselect de
  custos agrega `sale_items` sem primeiro restringir vendas do tenant/período,
  podendo varrer a tabela de itens inteira.
- Não há compressão HTTP nem política explícita de cache para assets. HTML, JS,
  CSS e imagens usam o comportamento padrão do servidor.

### Médio

- Os índices de listagens frequentemente não cobrem simultaneamente
  `tenant_id`, `branch_id`, exclusão lógica, filtro e ordenação.
- `include` de relações completas aparece em produtos, vendas, fiscal,
  despesas e clientes pet. Algumas telas recebem campos que não usam.
- Pets por cliente não têm paginação; históricos de agendamentos de pet/cliente
  têm limite fixo 100, sem navegação.
- O código frontend está dividido entre scripts inline, fontes `.ts`, JS
  compilado e JS manual. O build TypeScript não minifica e há grandes blocos
  legados desativados dentro do HTML, ainda transferidos pela rede.
- Três PNGs estáticos incluem dois arquivos acima de 1 MB. Não há `loading=lazy`
  nas imagens dinâmicas encontradas.
- O enforcement de billing consulta assinatura/plano por requisição autenticada
  quando habilitado. É candidato a cache curto isolado por tenant/usuário, com
  invalidação por webhook e mutações.
- O pooler na porta 6543 é reconhecido e recebe `pgbouncer=true` e
  `connection_limit=1`. Isso é seguro para Railway, mas a capacidade precisa
  ser ajustada com métricas de concorrência; valor 1 pode serializar queries
  paralelas do dashboard.

### Baixo

- `main.ts` usa `console.log`; há logs de JWT que devem ficar condicionados ao
  ambiente/nível.
- Não há encerramento explícito do Prisma no shutdown hook.
- SWC pode reduzir build/boot de desenvolvimento, mas não melhora consultas ou
  latência de rede. É posterior às otimizações de runtime.

## B. Banco de dados e Prisma

### Pontos positivos

- O isolamento por `tenantId`/`branchId` está presente na maioria das queries
  de negócio e os principais modelos já possuem índices multi-tenant.
- Agenda, pedidos, vendas, despesas, funcionários e fornecedores já possuem
  paginação server-side e limites máximos nos DTOs.
- O schema usa `DIRECT_URL` para migrations e trata a porta 6543 do Supavisor.
- `npx prisma validate` confirmou que o schema atual é válido.

### Índices candidatos

Aplicar somente após `EXPLAIN ANALYZE` no banco de produção ou réplica:

- `Product(tenantId, branchId, createdAt)` para a listagem padrão.
- `Pet(tenantId, branchId, clientId, deletedAt, createdAt)` e
  `PetPhoto(tenantId, branchId, petId, createdAt)`.
- `ProductImage(productId, createdAt)`.
- `Order(tenantId, branchId, status, deletedAt, createdAt)` para filtro +
  ordenação.
- `Sale(tenantId, branchId, status, deletedAt, soldAt)` para dashboard e
  histórico.
- `Expense(tenantId, branchId, status, deletedAt, date)` para dashboard.
- `AgendaPet(tenantId, branchId, deletedAt, startAt)`; quando status for
  seletivo, avaliar variante com status antes da data.
- `Subscription(tenantId, updatedAt)` para a consulta de entitlement mais
  recente.
- `ExpenseFile(expenseId, deletedAt, createdAt)`.

Índices simples como `deletedAt` têm baixo valor isoladamente em tabelas
multi-tenant e podem ser removidos apenas depois de comprovação de não uso.
Índices parciais PostgreSQL (`WHERE deleted_at IS NULL`) são melhores para
listagens ativas, mas devem ser criados em migration SQL porque não são
expressos integralmente pelo Prisma schema.

Para busca textual, avaliar:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY ... ON products
USING gin (lower(name) gin_trgm_ops);
```

Repetir apenas para campos com volume e uso comprovados. `CONCURRENTLY` não
pode ficar dentro de transaction de migration Prisma.

### Queries problemáticas

- `ProductsService.findAll`: sem página/cursor, inclui todas as imagens.
- `ProductsService.lookupForPos`: busca até 50 registros para ordenar em Node;
  barcode/SKU exatos devem usar os índices únicos e o texto deve limitar o
  payload a uma thumbnail.
- `DashboardService.getSummaryForContext`: agregação de `sale_items` deve ser
  correlacionada às vendas filtradas.
- `PetClientsService.findAll`: árvore cliente -> pets -> fotos pode multiplicar
  payload. A listagem deve retornar resumo e thumbnail; detalhe carrega a árvore.
- `SalesService` e `FiscalService`: constantes de `include` trazem relações
  completas. Separar select de listagem do select de detalhe.
- `UsersService.findAll` e `PaymentMachinesService.findAll` não têm paginação;
  hoje podem ser pequenos, mas precisam limite/página antes de crescer.

Não foi encontrado N+1 clássico de Prisma dentro de loops. O principal N+1 é
externo: geração de URL assinada por imagem. Quando URLs assinadas forem
necessárias, usar lote (`createSignedUrls`) e cache curto por bucket/caminho.

### Pooling

- `DATABASE_URL`: usar a URL do pooler Supavisor/PgBouncer para runtime.
- `DIRECT_URL`: usar conexão direta somente para migrations.
- Nunca registrar URLs completas. Validar apenas host mascarado, porta,
  `pgbouncer`, SSL e limite.
- Rever `connection_limit=1` com métricas p95 e concorrência. Sugestão inicial:
  parametrizar via ambiente em vez de fixar, mantendo um limite pequeno por
  réplica.

## C. Backend

- Adicionar processamento `sharp` em serviço dedicado, antes do upload.
- Definir `limits.fileSize` no `FileInterceptor` e manter validação pós-processo.
- Validar imagem pelo decoder/assinatura real, dimensões e limite de pixels.
- Adicionar compressão com limiar para JSON/texto; não recomprimir imagens,
  PDFs ou respostas já comprimidas.
- Configurar headers de assets: HTML `no-cache`; arquivos versionados
  `public,max-age=31536000,immutable`; arquivos ainda sem hash com TTL curto e
  ETag.
- Cachear apenas dados read-only e com chave contendo, conforme o endpoint,
  `tenantId`, `branchId`, `userId`, papel/permissão, `systemType` e filtros.
- Primeiros candidatos: planos ativos, entitlement/billing curto, contexto de
  sistema e dashboard por poucos segundos. Mutações e webhooks devem invalidar.
- Cache em memória é por réplica e desaparece em redeploy. Serve para reduzir
  bursts, não como fonte de verdade. Redis só é necessário quando houver várias
  réplicas ou invalidação distribuída.
- Fastify não deve ser trocado agora: `FileInterceptor`, tipos Express,
  `cookie-parser`, `express.json` e static serving exigem adaptação e regressão
  ampla. Medir depois das mudanças de banco/payload.
- SWC é compatível como melhoria de build após separar o build frontend. Não é
  prioridade de runtime.

## D. Frontend

- Trocar quatro fetches do dashboard por um fetch agregado.
- Implementar debounce de 250–350 ms e `AbortController` em todas as buscas.
- Adicionar paginação real à tela de produtos.
- Usar thumbnail nas grades e imagem média apenas em detalhe/carrossel.
- Adicionar `loading="lazy"`, `decoding="async"` e dimensões nas imagens abaixo
  da dobra.
- Escapar dados antes de inseri-los em `innerHTML`; há muitos templates
  dinâmicos. Preferir `textContent`/DOM para dados de usuário.
- Migrar scripts inline e legados para fontes únicas. Os blocos
  `type="text/plain"`/`application/json` ainda pesam no HTML.
- Usar esbuild para bundle/minificação com nomes contendo hash e manifest.
  Manter HTML sem cache e assets com cache imutável.
- Converter os PNGs grandes para WebP/AVIF conforme suporte visual e manter
  fallback somente se necessário.

## E. Imagens e arquivos

### Fluxo atual

- Frontend envia `multipart/form-data`.
- Nest/Multer carrega o arquivo em memória.
- O storage verifica apenas MIME declarado e tamanho após o carregamento.
- Buffer original é enviado ao Supabase Storage.
- Banco guarda URL/caminho/nome; imagens não possuem metadados técnicos.
- Não foi encontrado armazenamento persistente de base64 no PostgreSQL.
  `FileReader.readAsDataURL` é usado somente para preview local.

### Pipeline recomendado

1. Multer rejeita o upload acima do limite bruto antes de alocar todo o corpo.
2. `sharp` decodifica com limite de pixels e falha para conteúdo inválido.
3. Aplicar rotação EXIF e remover metadados.
4. Gerar:
   - thumbnail: até 320x320, WebP qualidade 68–72;
   - média: até 960x960, WebP qualidade 74–78;
   - otimizada: até 1920x1920, WebP qualidade 78–82, somente se necessária.
5. Impedir ampliação, preservar proporção e limitar tamanho pós-compressão.
6. Nomear com UUID e sufixo de variante:
   `tenant/branch/products/product/uuid-thumb.webp`.
7. Fazer upload das variantes com `cacheControl` longo.
8. Salvar somente metadados e caminhos. Em erro parcial, remover objetos já
   enviados.
9. Listagens retornam apenas thumbnail; detalhe retorna média/otimizada.

Campos sugeridos para `ProductImage` e `PetPhoto`: `mimeType`, `size`,
`originalSize`, `width`, `height`, `thumbnailPath`, `thumbnailUrl`,
`thumbnailSize`. A URL derivável pode ser omitida ou tratada como compatibilidade
legada.

Para despesas:

- Imagens passam pelo mesmo pipeline, com uma versão legível.
- PDF/DOC/DOCX têm MIME real validado por magic bytes/estrutura, extensão
  normalizada e download forçado.
- Compressão destrutiva de PDF/DOC não deve ser automática no processo web:
  aumenta CPU, pode quebrar assinatura e requer ferramentas nativas. Limite,
  validação, antivírus assíncrono e armazenamento privado são a abordagem segura.
- GIF animado deve ser bloqueado ou explicitamente convertido para frame
  estático; hoje ele é aceito em despesas sem inspeção.

## F. Plano de implementação

1. Pipeline de imagens com `sharp`, limites Multer, variantes WebP, metadados,
   testes unitários e compatibilidade com registros antigos.
2. Migration aditiva para metadados e índices comprovados. Executar
   `prisma migrate deploy`; não remover colunas/índices nesta fase.
3. Paginação de produtos e selects enxutos de listagem; depois pets, usuários e
   máquinas.
4. Corrigir dashboard agregado e suas queries; medir p50/p95 e `EXPLAIN`.
5. Cache curto e isolado com invalidação explícita.
6. Compressão e cache headers.
7. esbuild/minificação, assets com hash, lazy loading e conversão dos PNGs.
8. Avaliar Fastify com suíte e ambiente de staging.
9. Avaliar SWC e pipeline Railway.

### Arquivos previstos

- `src/storage/*`, controllers de produtos/pets/despesas e respectivos testes.
- `prisma/schema.prisma` e nova migration.
- services/DTOs de produtos, dashboard, pets, usuários e máquinas.
- `src/main.ts`, `src/app.module.ts`, `package.json`, `railway.json`.
- `public/*`, `public/Js/*` e configuração de build frontend.

### Testes

- Unitários: MIME falso, arquivo corrompido, pixel bomb, EXIF, dimensões,
  tamanho, nomes/caminhos, cleanup em erro e isolamento tenant/branch.
- Integração: upload/listagem/detalhe/delete e registros legados.
- Banco: `EXPLAIN (ANALYZE, BUFFERS)` antes/depois com tenant pequeno e grande.
- Backend: payload, gzip/br, ETag/Cache-Control, autenticação, Dev SuperAdmin,
  billing e permissões.
- Frontend: busca, abort/debounce, paginação, upload, thumbnails e fallback.
- Carga: autocannon/k6 em produtos, dashboard, pedidos e histórico.

### Rollback

- Toda migration inicial é aditiva.
- Manter leitura de `fileUrl/storagePath` legado e escrita das novas variantes.
- Controlar novo pipeline e cache por flags de ambiente durante rollout.
- Para rollback de aplicação, voltar a release anterior; as colunas adicionais
  permanecem inofensivas.
- Não apagar originais legados até confirmar backfill e observabilidade.

### Baseline de validação

- `prisma validate`: aprovado.
- Suíte Jest completa: excedeu 180 segundos no ambiente de auditoria e foi
  interrompida. Rodar suítes por domínio nas etapas e investigar handles/tempo
  do conjunto completo.
- Nenhuma mudança de região/localização foi analisada ou proposta.

## Implementação posterior à auditoria

### Produtos

- `GET /api/products` agora aceita `page` e `limit` (máximo 50), preservando
  `pageSize` por compatibilidade.
- A resposta inclui `total`, `page`, `limit` e `totalPages`.
- A listagem seleciona somente os campos da grade e a primeira imagem.
- A primeira imagem prefere thumbnail, mantém fallback para `mediumUrl`,
  `fileUrl` e `storagePath` legados e resolve URLs privadas em lote.
- A tela usa paginação server-side, debounce de 300 ms e `AbortController`.
- O detalhe continua em `GET /api/products/:id` e usa imagens médias.

### Dashboard

- A tela passou de quatro requests para um `GET /api/dashboard`.
- A consulta de custos primeiro cria o conjunto de vendas filtrado por
  tenant/branch/status/período e só então agrega `sale_items`.
- O bundle tem fallback defensivo no frontend.

### Índices escolhidos

- Produto por tenant/branch/data: paginação e ordenação principal.
- Pet por tenant/branch/cliente/exclusão/data e fotos por
  tenant/branch/pet/data: telas de cliente pet.
- Pedido por tenant/branch/status/exclusão/data: listagens filtradas.
- Venda por tenant/branch/status/exclusão/data de venda: dashboard/histórico.
- Despesa por tenant/branch/status/exclusão/data: dashboard/listagens.
- Agenda por tenant/branch/exclusão/início: próximos agendamentos.
- Subscription por tenant/updatedAt: entitlement mais recente.
- ExpenseFile por despesa/exclusão/data: anexos ativos ordenados.

Todos são aditivos, preservam índices antigos e a migration usa
`CREATE INDEX IF NOT EXISTS`. O Prisma executa a migration em transação e não
aceita `CONCURRENTLY`; em tabelas grandes, aplicar em janela de menor escrita.
`pg_trgm` não foi ativado sem
medição; o SQL de medição está em
`sql/audit/performance_explain_analyze.sql`.

### Cache

- Somente o bundle do dashboard é armazenado, por 5 segundos por padrão.
- A chave inclui tenant, branch, usuário, papel, system type e filtros.
- Toda mutation autenticada invalida o escopo tenant/branch após sucesso.
- O cache é local, limitado, efêmero e não é fonte de verdade.

### HTTP e produção

- JSON/texto usam compressão acima de 1 KiB.
- Imagens, PDF, ZIP, fontes, octet-stream e formatos já comprimidos não são
  recomprimidos.
- HTML usa `no-cache`; asset com hash usa um ano/`immutable`; asset sem hash
  usa uma hora e ETag.
- Prisma desconecta no shutdown.
- O limite de conexões do pooler pode ser configurado sem registrar secrets.
- Logs diagnósticos rotineiros de JWT ficam desativados por padrão.

Variáveis opcionais novas:

```env
DASHBOARD_CACHE_TTL_MS=5000
PERFORMANCE_CACHE_MAX_ENTRIES=500
COMPRESSION_THRESHOLD_BYTES=1024
DATABASE_CONNECTION_LIMIT=1
JWT_DIAGNOSTIC_LOGS=false
```

O cache de billing/entitlement não foi ativado nesta etapa: invalidar
corretamente todas as transições assíncronas de gateway exige uma etapa própria.
Fastify, SWC, `pg_trgm` e bundling com hash também permaneceram fora do escopo
implementado.
