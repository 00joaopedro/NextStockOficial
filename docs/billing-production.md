# Billing SaaS recorrente em produção

O domínio de billing é independente de gateway. Mercado Pago é implementado
somente pelo adapter em `src/billing/gateways/mercado-pago`. A contratação cria
uma assinatura pendente hospedada (`preapproval`) vinculada ao tenant por uma
`external_reference` opaca e assinada. O backend envia preço, moeda e
recorrência do plano interno e recebe o `init_point` oficial; links fixos
compartilhados não ativam assinaturas.

## Regra de acesso

- Todo tenant recebe exatamente 7 dias de trial.
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

Configure a conta recebedora que criará as assinaturas pendentes hospedadas.
Os planos e preços do NextStock continuam sendo a fonte de verdade; não é
necessário criar nem configurar `preapproval_plan_id` no Mercado Pago. Não
envie access token ou webhook secret em chat, issue, commit ou frontend.

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
- `MERCADO_PAGO_SELLER_NAME` (opcional; nome exibido somente no painel SuperAdmin, nunca usado como credencial)
- `MERCADO_PAGO_MODE=production`

Configure o webhook do Mercado Pago para
`https://SEU_HOST/api/billing/webhooks/mercado-pago` e habilite notificações de
pagamento. O retorno visual é
`https://SEU_HOST/api/billing/checkout/return`.

## Campanha promocional

A campanha `lancamento-2026` usa um catálogo server-side de seis ofertas. A reserva válida aplica trial de 1 dia; o fluxo normal continua com 7 dias. O checkout promocional só é liberado quando a reserva contém plano/período válidos e há mapeamento ativo do gateway. Nunca confie no preço enviado pelo navegador.

O primeiro pagamento aprovado converte a reserva e contabiliza a vaga. Pagamentos pendentes ou rejeitados não convertem a vaga. Reembolso e chargeback suspendem a assinatura e permanecem registrados no ledger e na auditoria.

## Ordem de ativação

1. Configurar os segredos e a conta recebedora no Railway, inicialmente com checkout, webhook e
   enforcement desabilitados.
2. Aplicar a migration com `npm run railway:migrate` em job controlado, quando houver uma migration pendente.
3. Executar o seed controlado para gravar os mapeamentos em `gateway_plan_mappings`.
4. Usar o painel `/promocao-admin.html` para conferir as seis ofertas, abrir a campanha e validar a configuração; depois habilitar webhook e checkout em staging/sandbox e validar pagamento,
   reenvio de webhook, reconciliação, reembolso e chargeback.
5. Agendar `npm run billing:reconcile`.
6. Auditar subscriptions, invoices, payments e events.
7. Somente então definir `BILLING_ENFORCEMENT_ENABLED=true` em produção.

Nunca execute migration longa no boot do processo web.

## Teste temporário de produção de R$ 1,00

O teste cria uma assinatura pendente hospedada de R$ 1,00 usando o plano técnico
interno do NextStock. Não use link fixo nem altere os planos comerciais.

Configure temporariamente no Railway de produção:

- `BILLING_PRODUCTION_TEST_ENABLED=true`
- `BILLING_PRODUCTION_TEST_ADMIN_EMAIL=0oficialwhis@gmail.com`

Depois execute, no Console da Railway do serviço de produção, o comando:

```bash
npm run billing:production-test:seed
```

Antes de criar qualquer checkout, execute a pré-validação sem cobrança:

```bash
npm run billing:production-test:preflight
```

Ela consulta apenas a conta no Mercado Pago; não cria assinatura, checkout,
pagamento ou webhook. O comando confirma que o token pertence ao
`MERCADO_PAGO_COLLECTOR_ID` configurado. A saída nunca mostra o token.

Esse comando exige as variáveis acima, usa o mesmo modo efetivo do checkout
(`BILLING_MODE` ou `MERCADO_PAGO_MODE`) e cria/atualiza de forma idempotente o
plano técnico `production-test-r1` e seu mapeamento de gateway. Ele não executa
as migrações nem altera os planos comerciais. O comando falha de propósito se
o recurso não estiver explicitamente habilitado ou se o modo não for
`production`. Esse plano fica oculto da lista normal e só pode ser iniciado
pelo administrador cujo e-mail foi allowlistado. O botão aparece na área de
assinatura de `perfil.html`.

O pagamento deve ser iniciado pelo botão do NextStock, não pelo link público do
Mercado Pago, para que a `external_reference` identifique o tenant. Após o
teste, defina `BILLING_PRODUCTION_TEST_ENABLED=false`.

## Mudanças de plano: validação pendente

A mudança é planejada para a próxima renovação. Após atualizar a assinatura,
consulta-se os termos do provedor; o lote de reconciliação também tenta confirmar
operações desconhecidas antes de processar pagamentos. O lote só é automático se
estiver agendado no ambiente. A migração que limita alterações simultâneas falha
se já houver alterações pendentes conflitantes; concilie-as antes de aplicá-la.

Esta alteração não valida automaticamente mudanças de período promocional,
webhooks atrasados de cobranças antigas ou conflito com cancelamento concorrente.
A política de limites no downgrade e o comportamento real do Mercado Pago precisam
ser definidos e verificados antes de habilitar a funcionalidade para clientes.
