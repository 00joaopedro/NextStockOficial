# Diagnóstico de pagamentos de assinatura

Execute no console do serviço Railway, com o deploy deste código e as variáveis de banco e `MERCADO_PAGO_ACCESS_TOKEN` já configuradas. Não envie o token a ninguém. Informe o tenant exato e até cinco IDs numéricos de pagamentos separados por vírgulas:

```sh
BILLING_DIAGNOSTIC_TENANT_ID='UUID_DA_EMPRESA' BILLING_DIAGNOSTIC_PAYMENT_IDS='ID_ANTIGO,ID_NOVO' npm run billing:payment:diagnostic
```

O relatório em JSON usa GET no Mercado Pago e consultas no banco, sem criar cobranças, estornos ou modificar dados. A saída não inclui token, dados completos do cliente ou payloads. Ele compara a referência do pagamento obtida do provedor com um checkout do tenant informado, lista os pagamentos e eventos associados, consulta a assinatura e a primeira página de até 20 faturas, e lista eventos de webhook cujo recurso seja o ID do pagamento. Os sufixos facilitam correlação sem expor os identificadores completos.

`CHECKOUT_NOT_FOUND_FOR_TENANT` indica que a referência retornada pelo provedor não foi encontrada naquele tenant; não prova inexistência em outros ambientes. Uma falha HTTP ou de rede significa consulta inconclusiva, não ausência de dados. Os indicadores `truncated` apontam limites; faturas não são consideradas ausentes quando a API não informa paginação. O relatório não determina automaticamente por que uma assinatura foi suspensa e não substitui conferência de datas, vínculos e eventos. A consulta de webhooks por ID não inclui notificações relativas a outros recursos da assinatura.
