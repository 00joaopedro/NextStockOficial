# Recuperação direcionada de pagamento

Este comando altera dados de cobrança e pode ativar uma assinatura. Use somente após conferir o pagamento no Mercado Pago e o diagnóstico `billing:payment:diagnostic`, com tenant e pagamento identificados. Não repete cobrança, cancelamento ou estorno. Não cole tokens ou URLs de banco em chamados ou relatórios.

## Antes de executar

1. Confirme backup e acesso operacional ao tenant correto, deploy da versão revisada e CI aprovado. Verifique se o pagamento está aprovado, não foi estornado e corresponde ao valor, moeda, referência e assinatura esperados.
2. No console do serviço NestJS, confira se o ambiente é o pretendido e se as credenciais do provedor e do banco estão configuradas, sem exibir seus valores. O comando usa o token da conta vendedora. Em uma instalação de desenvolvimento compile antes com `npm run build:scripts`; a imagem Railway compilada já contém `dist/scripts/maintenance/billing-recover-payment.js`.
3. Confirme que nenhum operador esteja processando a mesma ocorrência e registre a justificativa e os identificadores em local de suporte autorizado.

## Executar

Substitua os valores pelos IDs verificados; não coloque token no comando:

```sh
BILLING_RECOVERY_TENANT_ID='UUID_DA_EMPRESA' BILLING_RECOVERY_PAYMENT_ID='ID_NUMERICO_DO_PAGAMENTO' npm run billing:recover-payment
```

A ferramenta consulta novamente o pagamento por GET, exige pagamento aprovado com data, encontra o checkout pelo tenant e referência e compara valor, moeda, provedor e assinatura atual. Em seguida chama o processamento de pagamento, que escreve no banco e registra eventos. Se o provedor informar ID de assinatura, ele também deve coincidir; caso não informe, esse vínculo não é verificado diretamente pelo pagamento. Repetições não devem ser consideradas sucesso sem conferir o resultado e o estado atual.

## Depois de executar

Confira o JSON `result`: `processed` e `applied` indicam o resultado do processamento, mas não garantem por si só que o acesso foi ativado. Uma duplicata ou evento anterior pode retornar `applied: false` com `reason`. Execute novamente o diagnóstico somente de leitura e verifique pagamento, checkout, assinatura, período pago e eventos; confira também no perfil se o acesso está correto. Se divergir, pare e investigue antes de repetir ou alterar dados.

Falhas saem com código não zero. `INVALID_INPUT` indica formato inválido; `PAYMENT_NOT_ELIGIBLE`, pagamento não aprovado, ID divergente ou ausência de referência/data; `PAYMENT_CORRELATION_FAILED`, checkout, valor, moeda ou vínculo incompatível; `UNEXPECTED_ERROR`, falha de consulta, inicialização ou processamento. O erro genérico não comprova que nenhuma escrita ocorreu, pois pode acontecer após o início do processamento. Consulte os estados antes de qualquer nova tentativa. Não apague nem altere registros manualmente para contornar as validações.
