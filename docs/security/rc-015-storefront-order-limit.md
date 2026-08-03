# RC-015 — limite de pedidos públicos ativos

O limite autoritativo é de **três** pedidos `storefront_guest`, por tenant,
storefront/filial e telefone canônico, em uma janela móvel de 30 dias baseada em
`orders.created_at`. O instante único é `transaction_timestamp()` do PostgreSQL
(UTC na aplicação). A fronteira inicial é inclusiva. Contam os estados `pending`,
`preparing` e `paid`; registros cancelados, entregues, reembolsados, soft-deleted
ou anteriores à janela não contam.

O telefone canônico preserva todos os dígitos (incluindo país e zeros), remove
somente a formatação aceita pelo DTO e limita-se aos 20 dígitos já persistidos.
Prefixos não são inferidos. Telefone ausente ou com menos de oito dígitos é
rejeitado como requisição inválida.

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
