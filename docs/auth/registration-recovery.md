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

A tentativa de reserva promocional no navegador fica vinculada ao ID da conta,
ao tenant e à campanha, plano e período selecionados. A mesma tentativa pode ser
repetida após falha temporária; trocar conta, tenant ou oferta gera outra chave.
Chaves antigas sem esse escopo são descartadas. A limpeza do contexto de sessão
preserva somente a tentativa cujo escopo corresponda à resposta autenticada do
cadastro; nenhuma senha ou credencial é persistida.

No backend, uma reserva válida ou convertida só é reaproveitada quando plano e
período correspondem à oferta solicitada. Oferta diferente ou metadados ausentes
retornam conflito `PROMOTION_RESERVATION_OFFER_MISMATCH`, sem substituir a reserva
nem consumir outra vaga. A verificação também cobre o vencedor de corridas de
reciclagem e de criação concorrente. A resposta de reserva mantém seu formato,
e preços, vagas e regras de elegibilidade continuam definidos no backend.

Sem migração nova e sem alteração automática de contas existentes. Os testes usam
provedores simulados e PostgreSQL de teste; não é necessário efetuar pagamento
Mercado Pago nem cadastrar contas reais para executá-los.
