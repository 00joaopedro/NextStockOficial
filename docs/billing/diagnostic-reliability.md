# Diagnóstico de cobrança e webhook

O comando `npm run billing:payment:diagnostic` é somente leitura. Ele consulta um tenant e até cinco pagamentos informados por `BILLING_DIAGNOSTIC_TENANT_ID` e `BILLING_DIAGNOSTIC_PAYMENT_IDS`; exige `MERCADO_PAGO_ACCESS_TOKEN` no ambiente. Não cole tokens ou respostas completas do provedor em chamados.

A consulta de faturas usa o filtro `preapproval_id` do fluxo principal. Um HTTP 400 registra o status e, quando presente em formato UUID, o identificador da requisição do provedor. O código não estabelece a causa do HTTP 400; compare com o diagnóstico de pagamento e os logs antes de agir. Respostas JSON inválidas ou sem lista de resultados são identificadas como erro, não como lista vazia. O campo `truncated` indica quando o total informado supera a lista recebida.

Eventos de webhook usam um identificador local no log; o relatório exibe seu sufixo, o status, tentativas e código seguro. `PROVIDER_*` indica falha na consulta ao provedor; `PROCESSING_*`, falha na aplicação do evento. `Pxxxx` é um código Prisma, não a mensagem do banco. `LEGACY_ERROR` não identifica a causa. `FAILED_RETRYABLE` significa que o evento pode ser reclamado numa nova entrega; não comprova que uma retentativa automática ocorreu. Eventos posteriores processados não demonstram, por si, que o evento com falha foi reprocessado. Confira o estado atual e as tentativas antes de qualquer intervenção; não edite o banco nem reenvie operações financeiras manualmente.

O diagnóstico de estorno na página procura um pagamento elegível aprovado. Se não encontrar e houver um pagamento de teste local estornado, retorna `TECHNICAL_PAYMENT_REFUNDED` e `localStatus: REFUNDED`. Isso é evidência local e pode corresponder a um pagamento anterior; consulte o relatório do pagamento específico para conferir o provedor. Não significa crédito na fatura do cartão.

No perfil, o aviso de carregamento parcial lista as seções que falharam sem revelar o conteúdo das respostas. Recarregue para tentar a leitura novamente; investigue os logs da API no horário do problema se persistir.
