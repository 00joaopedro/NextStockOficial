# Recuperação segura do cadastro público

O cadastro público mantém uma tentativa única por e-mail normalizado. A mesma
tentativa e os mesmos dados podem ser repetidos sem criar outra empresa. Uma
tentativa concluída continua passando pela autenticação da senha antes de
retornar acesso. Alterar dados de uma tentativa concluída não altera a conta.

Dados corrigidos só substituem uma tentativa `FAILED_RETRYABLE`, sem claim ativo,
empresa, filial ou conclusão, e cuja falha seja conhecida como segura: erro de
consulta antes de criar identidade, rollback confirmado da transação e identidade,
rejeição de política de senha ou de limite de tentativas no provedor.

Antes da recuperação, são verificadas a ausência de perfil por e-mail/identidade
anterior e a ausência de identidade no provedor, inclusive pelo ID anterior quando
existir. Uma falha na verificação não significa ausência de conta. A atualização
condicional inclui estado, payload anterior, data da versão observada e lease;
somente uma requisição pode reclamar a tentativa.

Estados `UNKNOWN`, `COMPENSATION_REQUIRED`, tentativas em andamento, falhas
ambíguas de criação remota e contas existentes não são apagados nem reiniciados.
Tentativas antigas sem código seguro continuam exigindo reconciliação restrita:
não se deve apagar registros ou contas para contornar a proteção.

O formulário bloqueia envio simultâneo e é liberado após falha. Uma resposta
temporária com requestId válido exibe uma referência para suporte. A senha não
é guardada no sessionStorage nem incluída nas evidências de recuperação.

Se a conta foi criada mas a sessão falhou, entrar com e-mail e senha é o caminho
de recuperação; editar os dados e repetir o cadastro não deve criar outra conta.
Não se renova a sessão com base apenas na posse de uma chave de idempotência.

Esta etapa não muda a reserva promocional, suas vagas, seus preços, o identificador
da reserva no navegador ou a comparação da oferta com uma reserva existente.
Esses dois ajustes ficam para uma etapa posterior no mesmo PR.

Sem migração nova e sem alteração automática de contas existentes. Os testes usam
provedores simulados e PostgreSQL de teste; não é necessário efetuar pagamento
Mercado Pago nem cadastrar contas reais para executá-los.
