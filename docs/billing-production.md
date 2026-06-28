# Billing SaaS em produção

O domínio de billing é independente de gateway. Mercado Pago é implementado
apenas pelo adapter em `src/billing/gateways/mercado-pago`.

## Ordem de ativação

1. Aplicar a migration com `prisma migrate deploy`.
2. Executar o seed controlado para planos e mappings.
3. Auditar subscriptions e o grace period de backfill.
4. Configurar credenciais e webhook Mercado Pago.
5. Habilitar checkout e webhook.
6. Validar eventos em produção sem enforcement.
7. Somente então definir `BILLING_ENFORCEMENT_ENABLED=true`.

Os links `mpago.la` iniciais são mappings de banco e não aceitam uma
`external_reference` individual criada pelo NextStock. Por isso, retorno do
navegador, link aberto e webhook sem referência confiável nunca ativam a
subscription. Ativação automática segura exige preference dinâmica ou
preapproval que preserve a external reference do checkout interno.

## Variáveis

- `PUBLIC_APP_URL`
- `BILLING_ENFORCEMENT_ENABLED`
- `BILLING_CHECKOUT_ENABLED`
- `BILLING_WEBHOOK_ENABLED`
- `BILLING_EXTERNAL_REFERENCE_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_COLLECTOR_ID`
- `MERCADO_PAGO_MODE`
