# RC-015 — limite de pedidos públicos ativos

O limite autoritativo é de **três** pedidos `storefront_guest`, por tenant,
storefront/filial e telefone canônico, em uma janela móvel de 30 dias baseada em
`orders.created_at`. O instante único é `transaction_timestamp()` do PostgreSQL
(UTC na aplicação). A fronteira inicial é inclusiva. Contam os estados `pending`,
`preparing` e `paid`; registros cancelados, entregues, reembolsados, soft-deleted
ou anteriores à janela não contam.

O telefone canônico preserva todos os dígitos (incluindo país e zeros) e remove
somente a formatação aceita pelo DTO. São aceitos de 8 a 20 dígitos; valores fora
desse intervalo são rejeitados, nunca truncados. Prefixos não são inferidos:
números nacionais e internacionais permanecem identidades distintas.

| Status      | Conta? | Justificativa                    |
| ----------- | ------ | -------------------------------- |
| `pending`   | sim    | reserva pública aberta           |
| `preparing` | sim    | pedido ainda em atendimento      |
| `paid`      | sim    | pedido pago ainda não finalizado |
| `delivered` | não    | estado final de entrega          |
| `canceled`  | não    | cancelamento libera o slot       |
| `refunded`  | não    | estado final após reembolso      |

Dentro da mesma transação curta, a ordem é: `pg_advisory_xact_lock` da identidade
RC-015; releitura da idempotência; relógio do banco e `count`; produtos ordenados
por slug e CAS de estoque; criação do pedido/itens; Audit Outbox. O lock bigint é
os primeiros 64 bits assinados de SHA-256 sobre namespace, tenant, storefront,
filial e telefone. Colisão apenas serializa identidades sem relação e nunca abre
um quarto slot. O lock é transacional e sai apenas em commit/rollback.

O `count` e a criação usam o mesmo Prisma transaction client. Não há HTTP, cache
ou mutex local na transação. `P2034` recebe no máximo três tentativas; outros
erros não são repetidos. Ao observar três pedidos, a API mantém o contrato 409
(`ConflictException`) sem estoque, pedido, outbox de sucesso ou invalidação.

Cancelamento e expiração somente retiram pedidos do conjunto, portanto uma
corrida pode rejeitar conservadoramente antes que um slot seja liberado, mas não
cria um quarto ativo. As transições da RC-007 não permitem reativar estados
terminais. Repetição idempotente é relida sob o lock e retorna o mesmo pedido sem
estoque ou outbox duplicados; payload divergente continua sendo conflito.
