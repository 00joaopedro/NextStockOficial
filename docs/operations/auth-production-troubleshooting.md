# Auth em produção — diagnóstico Prisma/Supabase

Use este guia quando `/api/health` e `/api/health/ready` passam, mas `/api/auth/login` ou `/api/auth/register` retornam erro por Prisma.

## Logs esperados

O `ProductionExceptionFilter` registra erros Prisma conhecidos com dados sanitizados:

```text
request_failed id=... method=POST path=/api/auth/register status=500 error=PrismaClientKnownRequestError code=P2022 meta={"modelName":"UserProfile","column":"profiles.allowed_system_types"}
```

Nunca inclua senha, cookies, JWT, `DATABASE_URL`, `DIRECT_URL`, service role key ou outros secrets em logs manuais.

## Códigos mais comuns

- `P2022`: coluna ausente no banco. Normalmente migration pendente.
- `P2021`: tabela ausente. Normalmente migration pendente.
- `P2002`: constraint única violada. Deve voltar 409 para duplicidade esperada.
- `P2003`: FK inválida. Indica vínculo tenant/branch/profile inconsistente.
- `P2025`: registro obrigatório não encontrado. Indica vínculo incompleto.
- `P2010`: erro SQL raw. Verificar migration/schema e SQL gerado.

## Auditoria dry-run de usuário

```bash
npx ts-node scripts/auth/audit-user.ts --email usuario@email.com --dry-run
```

O script só lê dados e mascara IDs. Ele verifica:

- usuário no Supabase Auth;
- profile em `profiles`;
- `supabase_user_id`, `tenant_id`, `primary_tenant_id`;
- tenant, branch e tenant_member;
- `system_type` e `allowed_system_types`;
- status de funcionário para login.

## Auditoria dry-run de schema Auth

```bash
npx ts-node scripts/auth/audit-schema.ts
```

O script só lê `_prisma_migrations`, `information_schema.tables` e `information_schema.columns` para confirmar migrations e colunas críticas de autenticação.

## Correção de migration pendente na Railway

Não use `prisma db push` em produção.

Quando a auditoria indicar migration pendente ou coluna ausente, execute o fluxo controlado:

```bash
npm run railway:migrate
```

Esse comando valida o alvo com `scripts/migrations/validate-target.ts` antes de aplicar `prisma migrate deploy`.
