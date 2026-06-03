# Deploy NextStock

Este projeto usa Prisma Migrate como fonte oficial de alteracoes de banco.

## Variaveis obrigatorias para banco

Configure no Railway:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

- `DATABASE_URL`: conexao usada pela aplicacao em runtime.
- `DIRECT_URL`: conexao direta usada pelo Prisma para migrations.

Ambas devem apontar para o Supabase PostgreSQL correto do ambiente.

## Scripts importantes

```bash
npm run build
npm run start:prod
npm run db:migrate
```

`start:prod` deve continuar apenas iniciando o backend:

```bash
node dist/src/main.js
```

Nao acople migrations ao `start:prod`.

## Migrations

Toda mudanca estrutural de banco deve ser commitada em:

```text
prisma/migrations/<timestamp_nome>/migration.sql
```

Para aplicar migrations em producao:

```bash
npm run db:migrate
```

Rode esse comando quando houver migration nova, antes ou depois do deploy, conforme a mudanca exigir. Em Railway, prefira executar como etapa manual/controlada ou job separado. Evite pre-deploy automatico se ele puder travar a publicacao.

## Validacao antes do deploy

```bash
npx prisma validate
npm run build
npm run build:frontend
npm test
```

## Supabase SQL Editor

O Supabase SQL Editor nao e o fluxo principal para schema do NextStock. Use-o apenas para consultas diagnosticas ou recuperacao operacional pontual.

Se uma correcao mudar estrutura de banco, ela deve virar migration Prisma antes de ser considerada pronta para deploy.
