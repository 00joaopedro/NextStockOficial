# RC-007 — máquina atômica de status de pedido

O estado corrente no banco, e não uma leitura anterior, decide toda transição. Cada
efeito ocorre na mesma transação do `updateMany` condicionado por `tenantId`,
`branchId`, `deletedAt` e pelos status de origem.

| Atual       | Permitidas                                   | Idempotente              | Proibidas                                  | Venda / estoque / timestamps / evento                                                                                                                                                            | CAS perdido                                                        |
| ----------- | -------------------------------------------- | ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `pending`   | `preparing`, `paid`, `delivered`, `canceled` | `pending`                | `refunded`                                 | pagamento cria uma venda e `SalePayment.paidAt`; entrega define `deliveredAt` e `order.delivered`; cancelamento restaura estoque, define `canceledAt`/`stockRestoredAt` e `order.admin_canceled` | releitura; mesmo destino retorna sucesso, destino incompatível 409 |
| `preparing` | `paid`, `delivered`, `canceled`              | `preparing`              | `pending`, `refunded`                      | mesmos efeitos acima                                                                                                                                                                             | mesmo contrato                                                     |
| `paid`      | `delivered`, `refunded`                      | `paid` (venda existente) | `pending`, `preparing`, `canceled`         | venda permanece única; entrega somente define timestamp/evento; sem restauração                                                                                                                  | mesmo contrato                                                     |
| `delivered` | `refunded`                                   | `delivered`              | `pending`, `preparing`, `paid`, `canceled` | pagamento iniciado depois da entrega pode apenas materializar a venda sem regredir o pedido; repetição não altera `deliveredAt` nem cria evento                                                  | mesmo contrato                                                     |
| `canceled`  | nenhuma                                      | `canceled`               | todas as demais                            | repetição não restaura estoque nem cria auditoria novamente                                                                                                                                      | mesmo contrato                                                     |
| `refunded`  | nenhuma                                      | `refunded`               | todas as demais                            | terminal, sem efeitos novos                                                                                                                                                                      | mesmo contrato                                                     |

`cancel`, `deliver`, a alteração administrativa e `createFromOrder` fazem o claim
antes de seus efeitos. Falha de venda, documento, pagamento, auditoria ou estoque
aborta a transação inteira. A unique de `Sale.orderId` permanece apenas como defesa
adicional. Não há chamada de gateway dentro dessas transações.
