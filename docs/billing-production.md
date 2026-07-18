# Billing SaaS recorrente em produção

O domínio de billing é independente de gateway. Mercado Pago é implementado
somente pelo adapter em `src/billing/gateways/mercado-pago`. A contratação cria
uma assinatura individual (`preapproval`) vinculada ao tenant por uma
`external_reference` opaca e assinada; links fixos compartilhados não ativam
assinaturas.

## Regra de acesso

- Todo tenant recebe exatamente 15 dias de trial.
- Após `trialEndsAt`, somente uma cobrança `APPROVED`, confirmada na API do
  gateway, deixa a subscription `active` e libera acesso.
- Retorno do navegador, criação da assinatura externa, status informado pelo
  frontend e webhook não verificado nunca liberam acesso.
- Reembolso ou chargeback suspende a assinatura.

## Confirmação em múltiplas camadas

1. O backend cria referência interna assinada e uma preapproval individual.
2. O webhook HMAC é persistido e deduplicado.
3. O backend consulta o recurso na API do Mercado Pago, sem confiar no payload.
4. Provider, recebedor, ambiente, referência, valor e moeda são verificados.
5. Fatura, pagamento, assinatura e auditoria são atualizados em transação
   idempotente.
6. `npm run billing:reconcile` consulta novamente checkouts abertos para cobrir
   webhooks atrasados ou perdidos. Agende o comando a cada 5-15 minutos em um
   Railway Cron separado do processo web.

## Provisionamento no Mercado Pago

Crie um plano recorrente mensal para Ouro, Esmeralda e Diamante na mesma conta
recebedora. Copie apenas seus IDs de plano para variáveis protegidas do Railway.
Não envie access token ou webhook secret em chat, issue, commit ou frontend.

Variáveis protegidas necessárias:

- `BILLING_DEFAULT_PROVIDER=MERCADO_PAGO`
- `BILLING_MODE=production`
- `BILLING_ENFORCEMENT_ENABLED`
- `BILLING_CHECKOUT_ENABLED`
- `BILLING_WEBHOOK_ENABLED`
- `BILLING_EXTERNAL_REFERENCE_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_WEBHOOK_SECRET`
- `MERCADO_PAGO_COLLECTOR_ID`
- `MERCADO_PAGO_MODE=production`
- `MERCADO_PAGO_PLAN_ID_OURO`
- `MERCADO_PAGO_PLAN_ID_ESMERALDA`
- `MERCADO_PAGO_PLAN_ID_DIAMANTE`

Configure o webhook do Mercado Pago para
`https://SEU_HOST/api/billing/webhooks/mercado-pago` e habilite notificações de
pagamento. O retorno visual é
`https://SEU_HOST/api/billing/checkout/return`.

## Ordem de ativação

1. Criar e conferir os três planos mensais no Mercado Pago.
2. Configurar segredos e IDs no Railway, inicialmente com checkout, webhook e
   enforcement desabilitados.
3. Aplicar a migration com `npm run railway:migrate` em job controlado.
4. Executar o seed controlado para gravar os IDs em `gateway_plan_mappings`.
5. Habilitar webhook e checkout em staging/sandbox e validar pagamento,
   reenvio de webhook, reconciliação, reembolso e chargeback.
6. Agendar `npm run billing:reconcile`.
7. Auditar subscriptions, invoices, payments e events.
8. Somente então definir `BILLING_ENFORCEMENT_ENABLED=true` em produção.

Nunca execute migration longa no boot do processo web.
