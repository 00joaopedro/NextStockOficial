# Modo visualização (read-only)

O modo visualização permite navegar e consultar dados dentro das permissões
normais do usuário, mas impede operações que alterem estado.

## Conceitos separados

- Preview público: navegação anônima com dados demonstrativos locais, sem tenant,
  filial ou consultas às APIs de negócio.
- `Tenant.mode = visualizacao`: ativa read-only.
- `Tenant.systemType = padrao | petshop`: define os módulos disponíveis.
- `role`: define quais recursos o usuário pode acessar.
- tenant e branch: definem o escopo dos dados.

Visualização não concede acesso adicional. RBAC, billing, tenant, branch,
`systemType`, workspace Dev e suporte explícito continuam obrigatórios.

No preview público não há acesso adicional porque não existe contexto operacional:
o frontend cria somente um contexto visual local (`PREVIEW`) e não envia mutações.
As rotas mutáveis continuam protegidas por autenticação no backend.

## Política HTTP

São permitidos em visualização:

- `GET`
- `HEAD`
- `OPTIONS`

Requisições autenticadas com outros métodos são avaliadas contra o modo do
tenant selecionado. Em `visualizacao`, a API responde:

```json
{
  "statusCode": 403,
  "code": "PREVIEW_MODE_MUTATION_BLOCKED",
  "message": "Modo visualização: ação bloqueada."
}
```

O bloqueio é aplicado globalmente e reforçado pelos serviços que resolvem
`TenantContext` com `writable: true`. Rotas públicas sem usuário, como login e
webhooks assinados, seguem suas próprias políticas de segurança.

## Frontend

`GET /api/system/context` é a fonte de verdade para `systemMode`,
`mode`, `tenantType` e `systemType`. `sessionStorage` serve apenas como cache de
interface e nunca autoriza uma operação.

No preview público, a seleção `padrao | petshop` da página inicial é a fonte do
contexto exclusivamente visual. A sidebar e as páginas devem usar esse contexto
antes de qualquer bootstrap autenticado, não devem chamar profile, billing ou
APIs de negócio e devem manter todos os controles de alteração desabilitados.
Uma tentativa mutável feita por código de interface é interrompida antes da rede
com o mesmo código `PREVIEW_MODE_MUTATION_BLOCKED`; isso é defesa adicional e
não substitui os guards do backend.

Ao receber `PREVIEW_MODE_MUTATION_BLOCKED`, o frontend:

- mantém sessão e página;
- não redireciona para login ou billing;
- mostra uma mensagem de read-only.

`401`, `402 BILLING_ACCESS_REQUIRED` e `403` de RBAC/systemType continuam sendo
tratados separadamente.

## Checklist para novas rotas

1. Use `GET` somente para leitura sem efeito de negócio.
2. Use métodos mutáveis para qualquer alteração.
3. Resolva tenant/branch no backend.
4. Use `writable: true` no serviço que grava dados.
5. Não crie exceção ao preview sem revisão de segurança.
6. Adicione teste de GET permitido e mutação bloqueada.

## Teste manual

1. Selecione um tenant/branch em `visualizacao`.
2. Confirme que contexto, sidebar e listagens carregam.
3. Confirme filtros e paginação.
4. Tente POST, PATCH e DELETE.
5. Verifique HTTP 403 e o code estável.
6. Repita em tenants `padrao` e `petshop`.
