# Perfil, billing e maquininhas

## Billing

`Plan` e o catalogo comercial. `Subscription` representa a contratacao do
tenant. O endpoint legado `PATCH /api/profile/plan` nao ativa planos: ele
retorna `409 BILLING_CHECKOUT_REQUIRED`.

O checkout cria uma assinatura recorrente individual no adapter configurado e
ativa ou altera a subscription somente depois de pagamento consultado no
gateway, autenticado, correlacionado e processado de forma idempotente.
`Tenant.currentPlanId` permanece apenas como compatibilidade de leitura para
tenants legados.

## Perfil e empresa

- `GET/PATCH /api/profile/me`: dados pessoais do usuario autenticado.
- `GET/PATCH /api/profile/company`: dados basicos do tenant.
- `GET /api/profile/subscription`: subscription efetiva ou plano legado.
- `PATCH /api/profile/mode`: restrito ao Dev SuperAdmin allowlisted.

Dados fiscais continuam em `CompanyFiscalConfig`, por tenant e filial. Nao ha
sincronizacao automatica entre os dados basicos e a configuracao fiscal.

## Maquininhas

Maquininhas sao isoladas por tenant e filial. `DELETE` realiza soft delete,
define status `inativa` e registra `updatedById`. A migration mantem
`branch_id` nullable para nao quebrar legados; rode primeiro o diagnostico em
`sql/audit/profile_production_audit.sql` e planeje o backfill manual.
