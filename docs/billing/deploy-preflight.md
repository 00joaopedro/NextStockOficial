# Pré-validação de deploy do billing

Este procedimento valida apenas a configuração local do serviço. Não cria checkout,
não consulta o Mercado Pago e não cria cobrança, assinatura ou estorno.

## Antes do deploy em produção

1. No Mercado Pago, configure a URL de notificações exatamente como:
   `https://SEU_DOMINIO/api/billing/webhooks/mercado-pago`.
2. Na Railway, confira que `APP_ENV=production`, `PUBLIC_APP_URL` usa HTTPS e
   `CORS_ALLOWED_ORIGINS` contém a mesma origem de `PUBLIC_APP_URL`.
3. Confira que `BILLING_WEBHOOK_ENABLED=true` e
   `MERCADO_PAGO_MODE=production`.
4. Confira a presença, sem copiar valores para logs, de:
   `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`,
   `MERCADO_PAGO_COLLECTOR_ID` e `BILLING_EXTERNAL_REFERENCE_SECRET`.
5. Opcionalmente, defina `MERCADO_PAGO_WEBHOOK_URL` com a URL configurada no
   Mercado Pago. Quando definida, o comando exige igualdade exata com a URL
   esperada. Essa variável é usada somente pela pré-validação; ela não altera
   o endpoint em execução.

## Execução no console Railway

```sh
npm run billing:deploy-preflight
```

O sucesso retorna JSON com `"ok":true` e a URL pública esperada do webhook.
O resultado nunca inclui valores de tokens, segredos ou chaves. Em caso de erro,
ele retorna apenas códigos seguros — por exemplo,
`MERCADO_PAGO_WEBHOOK_URL_MISMATCH` ou
`CORS_PUBLIC_APP_URL_MISSING` — e encerra com código diferente de zero.

Essa pré-validação não prova a entrega externa de um webhook; ela elimina
inconsistências de ambiente e URL antes do deploy sem exigir novo teste financeiro.
