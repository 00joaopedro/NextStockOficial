# Playbook de performance em produção — NextStock

Contexto atual: Railway Hobby + Supabase Free, NestJS + Prisma + PostgreSQL/Supabase, frontend HTML/CSS/TypeScript sem SPA pesada. Railway e Supabase já estão na mesma região; portanto, trate 11s como gargalo de query, pool, CPU/memória, cold start, payload excessivo ou trabalho síncrono no request.

## Ordem prática de diagnóstico

1. Meça a API: use o tempo total por rota nos logs do Railway e identifique endpoints acima de 1s.
2. Meça o Prisma: habilite `PRISMA_SLOW_QUERY_THRESHOLD_MS=500` e procure logs `[Prisma slow query]`.
3. Para cada query lenta, rode `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` no SQL Editor do Supabase.
4. Se aparecer `Seq Scan` em tabela grande, crie índice via nova migration Prisma append-only.
5. Reduza payloads: troque `include` amplo por `select` cirúrgico e adicione paginação.
6. Tire tarefas secundárias do caminho crítico com evento/fila.
7. Só depois avalie troca Express -> Fastify; ela não corrige query/pool ruim.

## 1. Diagnóstico do banco com Prisma + Supabase

### Log de queries lentas no Prisma

O `PrismaService` do projeto já configura o `DATABASE_URL` runtime e registra query events quando `PRISMA_SLOW_QUERY_THRESHOLD_MS` é maior que zero. Em produção, configure no Railway:

```env
PRISMA_SLOW_QUERY_THRESHOLD_MS=500
HTTP_SLOW_REQUEST_THRESHOLD_MS=1000
```

O log de Prisma sai somente quando a query passa do limite:

```text
[Prisma slow query] 1234ms SELECT "public"."Product"... params=[...]
```

`HTTP_SLOW_REQUEST_THRESHOLD_MS` reduz ruído no log HTTP e marca como `warn` apenas rotas lentas, além de continuar registrando erros.

Use esse log para capturar:
- rota chamada;
- SQL gerado;
- duração em ms;
- parâmetros sanitizados/truncados.

### EXPLAIN ANALYZE no Supabase

No SQL Editor do Supabase, copie a query lenta e substitua os placeholders pelos valores reais. Rode:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, name, "tenantId", "branchId"
FROM "Product"
WHERE "tenantId" = 'TENANT_ID'
  AND "branchId" = 'BRANCH_ID'
  AND active = true
ORDER BY name
LIMIT 50;
```

Procure no resultado:
- `Seq Scan`: leitura sequencial; ruim em tabela grande quando há filtro seletivo.
- `Index Scan`/`Bitmap Index Scan`: normalmente esperado quando o índice atende ao filtro.
- `Rows Removed by Filter`: alto indica índice ausente ou pouco seletivo.
- `Sort Method` com muitos dados: pode exigir índice que inclua a ordenação.
- `actual time=...`: tempo real gasto no nó do plano.

### Índices no Prisma

Mapeie colunas que aparecem juntas em `where`, `orderBy` e joins. Em app multi-tenant, comece quase sempre por `tenantId` e `branchId`:

```prisma
model Product {
  id       String  @id @default(uuid())
  tenantId String
  branchId String?
  name     String
  active   Boolean @default(true)
  sku      String?

  @@index([tenantId, branchId, active, name])
  @@unique([tenantId, branchId, sku])
}
```

Regras rápidas:
- índice composto deve seguir a ordem dos filtros mais comuns: igualdade primeiro, ordenação depois;
- use `@@unique` quando a regra de negócio exigir unicidade por tenant/filial;
- não crie índice para toda coluna: índices aceleram leitura, mas custam escrita e storage;
- em Supabase Free, storage/CPU são limitados; priorize os 5-10 endpoints mais lentos.
- Este repositório já inclui uma migration append-only com índices direcionados para listagens de clientes Pet, pedidos, vendas, documentos fiscais e despesas: `prisma/migrations/20260714000000_targeted_performance_indexes/`.

## 2. Pool de conexões Supabase/Supavisor

No Railway, runtime deve usar o Transaction Pooler na porta `6543` com PgBouncer/Supavisor. Migrations devem usar conexão direta/session na porta `5432`.

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
ADMIN_DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
DATABASE_CONNECTION_LIMIT=1
```

Para Railway Hobby + Supabase Free:
- mantenha `connection_limit=1` inicialmente para evitar esgotar conexões;
- aumente para `2` somente se logs mostrarem fila no Node e o banco suportar;
- nunca use pooler transaction (`6543`) para `prisma migrate deploy`;
- não rode migrations no `start:prod`.

No `schema.prisma`, mantenha `url = env("DATABASE_URL")` e `directUrl = env("DIRECT_URL")` no datasource.

## 3. Migração Express -> Fastify no NestJS

Fastify pode reduzir overhead HTTP, mas não resolve `Seq Scan`, payload grande ou API externa lenta. Implemente em staging primeiro.

1. Instale pacotes:

```bash
npm install @nestjs/platform-fastify @fastify/cookie @fastify/helmet @fastify/compress
```

2. Altere `main.ts` gradualmente:

```ts
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ trustProxy: true }),
);
await app.register(fastifyCookie);
await app.register(fastifyCompress, { threshold: 1024 });
await app.register(fastifyHelmet, { /* mesma CSP atual */ });
```

3. Pontos de quebra comuns:
- código usando APIs Express (`req.header`, `res.setHeader`, `res.redirect`) pode precisar adaptação;
- middlewares Express (`compression`, `cookie-parser`, `helmet`) devem virar plugins Fastify;
- testes e interceptors que tipam `Request`/`Response` do Express precisam revisão;
- uploads com Multer exigem estratégia Fastify compatível.

4. Critério de aceite: build + testes + smoke em staging + comparação p95 antes/depois.

## 4. Queries enxutas e paginação Prisma

### Trocar include pesado por select cirúrgico

Antes:

```ts
return this.prisma.order.findMany({
  where: { tenantId, branchId },
  include: {
    customer: true,
    items: { include: { product: true } },
    payments: true,
    fiscalDocuments: true,
  },
});
```

Depois:

```ts
return this.prisma.order.findMany({
  where: { tenantId, branchId },
  select: {
    id: true,
    code: true,
    status: true,
    total: true,
    createdAt: true,
    customer: { select: { id: true, name: true } },
    items: {
      select: {
        quantity: true,
        unitPrice: true,
        product: { select: { id: true, name: true, sku: true } },
      },
      take: 20,
    },
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
```

### Padrão simples de paginação

```ts
const page = Math.max(1, Number(query.page ?? 1));
const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
const skip = (page - 1) * pageSize;

const [items, total] = await this.prisma.$transaction([
  this.prisma.product.findMany({
    where: { tenantId, branchId, active: true },
    select: { id: true, name: true, sku: true, salePrice: true },
    orderBy: { name: 'asc' },
    skip,
    take: pageSize,
  }),
  this.prisma.product.count({ where: { tenantId, branchId, active: true } }),
]);

return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
```

Evite `skip` muito alto em tabelas enormes; quando isso aparecer no EXPLAIN, migre endpoints críticos para cursor pagination.

## 5. Tarefas em segundo plano

Para tarefas leves e não críticas, use eventos em memória:

```bash
npm install @nestjs/event-emitter
```

```ts
// app.module.ts
import { EventEmitterModule } from '@nestjs/event-emitter';

EventEmitterModule.forRoot({ wildcard: false });
```

```ts
// controller/service no caminho crítico
this.eventEmitter.emit('sale.created', { saleId, tenantId, branchId });
return { ok: true, saleId };
```

```ts
// listener
@OnEvent('sale.created', { async: true })
async handleSaleCreated(event: { saleId: string; tenantId: string; branchId: string }) {
  await this.emailService.sendReceipt(event.saleId);
}
```

Limitação: em Railway Hobby, eventos em memória podem ser perdidos se o processo reiniciar. Para tarefas importantes, prefira uma tabela `BackgroundJob` no Postgres com worker polling controlado ou uma fila externa quando houver orçamento.

## 6. Frontend com Vite

Vite pode minificar e gerar assets com hash para `public/dist`, mantendo HTML/CSS/TS puro.

1. Instale:

```bash
npm install -D vite
```

2. Crie `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'public/dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        dashboard: 'frontend-src/dashboard.ts',
      },
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
});
```

3. Ajuste script:

```json
{
  "build:frontend": "vite build"
}
```

4. Atualize HTMLs para usar o arquivo gerado. Se precisar evitar edição manual de hashes, crie manifest (`manifest: true`) e um helper no backend ou mantenha nomes estáveis inicialmente.

## Checklist para atacar os 11s

- [ ] Habilitar `PRISMA_SLOW_QUERY_THRESHOLD_MS=500` no Railway.
- [ ] Habilitar `HTTP_SLOW_REQUEST_THRESHOLD_MS=1000` no Railway para encontrar rotas lentas sem poluir logs.
- [ ] Coletar 20 logs lentos reais e agrupar por rota/query.
- [ ] Rodar `EXPLAIN (ANALYZE, BUFFERS)` nas 5 queries mais lentas.
- [ ] Criar migrations append-only com índices compostos tenant/branch/filtros/ordenação.
- [ ] Remover `include` pesado e limitar `select`/`take` nos endpoints críticos.
- [ ] Confirmar `DATABASE_URL` em `6543` e `DIRECT_URL`/`ADMIN_DATABASE_URL` em `5432`.
- [ ] Adiar Fastify até banco/payload/background estarem medidos.
- [ ] Mover APIs externas/e-mails/processamentos para evento/fila.
- [ ] Otimizar frontend com bundles minificados quando o gargalo for navegador/assets.
