# Pagar.me e Stone — evidências, limites e rollout

Consulta: **23 de julho de 2026**. A automação de consulta não conseguiu acessar os domínios oficiais neste ambiente (HTTP 403); por isso, os recursos de maior risco permanecem desligados e nenhuma API Stone foi presumida.

## Evidências oficiais e matriz

| Produto / página oficial | Versão / autenticação / teste | Evidência usada e limite |
|---|---|---|
| [Pagar.me — documentação](https://docs.pagar.me/) | Core API v5; secret key via HTTP Basic; chaves de teste | Pedidos e pagamento PIX são documentados. Esta entrega usa `POST /orders`, consulta `GET /orders/{id}` e validação não destrutiva em `GET /customers?size=1`. Cartão não foi implementado para evitar PAN/CVV e ampliar PCI. |
| [Pagar.me — referência de pedidos](https://docs.pagar.me/reference/criar-pedido) | v5; sandbox por chave de teste | PIX retorna a última transação da cobrança. Webhooks existem, mas o endpoint NextStock não foi habilitado até confirmar e testar o mecanismo atual de autenticidade no painel. |
| [Stone — portal oficial](https://www.stone.com.br/) | Produtos variam por contrato/homologação | Não foi encontrada, neste ambiente, comprovação acessível de uma API cloud pública que permita à Railway comandar qualquer maquininha de lojista. Cadastro manual é suportado; remoto não é simulado. TEF/SDK local requer software fora da Railway e aprovação comercial. |

| Capacidade | Mercado Pago | Pagar.me | Stone |
|---|---|---|---|
| PIX | SUPPORTED | SUPPORTED | UNKNOWN |
| cartão online | SUPPORTED | SUPPORTED (não ativado; PCI) | UNKNOWN |
| terminal físico | SUPPORTED | UNSUPPORTED | REQUIRES_LOCAL_SDK |
| listar terminais | SUPPORTED | UNSUPPORTED | REQUIRES_APPROVAL |
| iniciar cobrança POS | SUPPORTED | UNSUPPORTED | REQUIRES_LOCAL_SDK |
| webhook | SUPPORTED | SUPPORTED (processamento pendente) | UNKNOWN |
| estorno | SUPPORTED | SUPPORTED (não ativado) | UNKNOWN |
| OAuth | SUPPORTED | UNKNOWN | UNKNOWN |
| API key | SUPPORTED | SUPPORTED | UNKNOWN |
| sandbox | SUPPORTED | SUPPORTED | UNKNOWN |

Pagar.me e Stone permanecem identidades técnicas separadas: não há compartilhamento presumido de chave, URL base, account ID ou payload de webhook. Compartilham apenas portas, registry, criptografia, transações, roteamento e auditoria internos do NextStock.

## Operação

Variáveis de plataforma: `PAGARME_ENABLED`, `PAGARME_PIX_ENABLED`, `PAGARME_CARD_ENABLED`, `PAGARME_API_BASE_URL`, `STONE_ENABLED`, `STONE_TERMINALS_ENABLED` e `STONE_REMOTE_PAYMENTS_ENABLED`. Todas as flags iniciam `false`; a secret key Pagar.me é por tenant e fica no campo criptografado, nunca na Railway ou frontend.

No painel Pagar.me, gere uma chave de **teste**, conecte-a como admin e valide antes de ativar uma rota PIX. Configure webhooks somente em etapa posterior, depois de confirmar autenticidade e fixtures atuais. Na Stone, cadastre nome, filial, modelo e serial; o serial persistido é mascarado. `MANUAL` não confirma pagamento, `LOCAL_SDK`/`TEF` informam dependência local e `REMOTE_API` é rejeitado.

## Rollout e rollback

1. Aplicar a migration em job controlado e manter flags desligadas.
2. Validar build, sandbox e tenant piloto; ativar Pagar.me e depois PIX.
3. Manter cartão desligado até fluxo oficial de tokenização e avaliação PCI.
4. Ativar inventário Stone manual; remoto somente após contrato, documentação e homologação.
5. Rollback: desligar flags, remover rotas Pagar.me e voltar a Mercado Pago. Não remover enum, conexões nem histórico; a migration é forward-only.

Pendências bloqueantes para produção Pagar.me: teste real sandbox, autenticação/replay de webhook e reconciliação. Pendências Stone: definição do produto contratado, SDK/TEF/agente local, homologação, credenciais e sandbox. Não há endpoint Stone remoto nem webhook Stone nesta entrega.
