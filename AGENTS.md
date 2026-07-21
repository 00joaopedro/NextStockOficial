# AGENTS.md — NextStock

## Arquitetura do projeto
- Backend NestJS em `src/`, organizado por módulos de domínio (`auth`, `tenancy`, `products`, `orders`, `sales`, `fiscal`, `billing`, `storage`, `audit`, `observability`, etc.).
- Prisma é a camada de dados; schema em `prisma/schema.prisma` e migrations em `prisma/migrations/`.
- Frontend é HTML/CSS/JS puro em `public/`, com fontes TypeScript em `frontend-src/` compiladas para `public/dist/`.
- A API usa prefixo `/api`; arquivos estáticos são servidos pelo próprio NestJS.
- Supabase é usado para PostgreSQL/Auth/Storage; Railway é o alvo principal de produção.

## Comandos de verificação
Execute o mínimo aplicável à mudança e prefira estes comandos antes de concluir:
- `npx prisma validate`
- `npm run build`
- `npm run build:frontend` quando alterar `frontend-src/` ou `public/dist/`.
- `npm test -- --runInBand` ou testes focados (`npm test -- <arquivo>.spec.ts --runInBand`).
- `npm run test:security` e `npm run security:static` para mudanças de auth, tenancy, storage, fiscal, billing, sessões, auditoria ou dados sensíveis.
- `npm run railway:migrate` somente para aplicar migrations em ambiente controlado; não execute automaticamente no boot da aplicação.

## Segurança obrigatória
- Nunca commitar `.env`, credenciais, tokens, certificados A1, chaves Supabase/Mercado Pago, URLs de banco com senha ou dumps com PII.
- Não exponha `SUPABASE_SERVICE_ROLE_KEY` ao frontend; uploads e storage devem passar pelo backend.
- Não confie em tenant, filial, papel, preço, totais, status fiscal ou permissões enviados pelo navegador.
- Use DTOs com validação, `ValidationPipe` e respostas sem vazamento de stack trace/segredos.
- Certificados fiscais e documentos privados devem permanecer em buckets privados; use signed URLs apenas após validação de tenant/branch.
- Não adicione `try/catch` ao redor de imports.

## Isolamento multi-tenant, multi-branch e Dev
- Toda consulta/mutação de dado de negócio deve ser escopada por `tenantId` e, quando aplicável, `branchId`.
- Controllers protegidos devem resolver contexto via `TenantContextService`/`BranchContextGuard` e não por headers/campos do body como fonte de autoridade.
- Respeite memberships ativos, filial ativa, `systemType`, `mode` e papéis permitidos antes de escrever.
- Dev SuperAdmin deve operar em workspace isolado; acesso a tenant real só em modo suporte explícito e auditado.
- Em modo visualização/preview, mutações devem permanecer bloqueadas pelos interceptors/políticas existentes.
- Ao criar relações novas, prefira constraints compostas que preservem `tenantId`/`branchId` e impeçam associação cruzada.

## Migrations e banco de dados
- Migrations são append-only: nunca edite, renomeie ou apague migrations já versionadas/aplicadas.
- Toda alteração estrutural deve criar nova pasta em `prisma/migrations/<timestamp>_<descricao>/migration.sql` e atualizar `prisma/schema.prisma`.
- Não use SQL solto como fluxo principal; scripts em `sql/audit/` e `prisma/audit/` são diagnósticos/relatórios.
- Migrations devem ser idempotentes quando possível, seguras para dados existentes e acompanhadas de backfill/validação quando necessário.
- Para produção, aplique migrations com `npm run railway:migrate` em etapa manual/job controlado; `start:prod`/`start:railway` não deve rodar migrations.

## Fluxo de staging/produção
- Primeiro valide localmente com Prisma, build e testes relevantes.
- Em staging, aplicar migrations, rodar seed/backfill quando houver, executar auditorias SQL relevantes e validar `/api/health` e `/api/health/ready`.
- Verifique variáveis protegidas no Railway/Supabase antes de ativar recursos como billing, storage privado ou emissão fiscal real.
- Não habilite enforcement de billing, fiscal real ou políticas RLS novas antes de migration + backfill + auditoria passarem.
- Deploy de produção deve ser separado de migration longa/travada para evitar derrubar healthcheck com 502.

## Critérios antes de considerar concluído
- Código e schema seguem o isolamento tenant/branch e não criam caminhos de bypass por frontend/header.
- Migrations novas são append-only e foram validadas com `npx prisma validate`.
- Builds e testes aplicáveis foram executados ou a limitação do ambiente foi documentada.
- Mudanças de UI perceptíveis devem ter screenshot registrado quando possível.
- Logs, erros e auditoria não vazam segredos/PII e cobrem ações sensíveis.
- Documentação/README/DEPLOY foi atualizada quando a mudança altera operação, variáveis, migrations ou fluxo de produção.
