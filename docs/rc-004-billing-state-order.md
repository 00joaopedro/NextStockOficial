# RC-004 — ordem monotônica do billing

## Mapeamento anterior

O adapter Mercado Pago normalizava `approved`, `rejected`, `cancelled/canceled`,
`refunded` e `charged_back` para `APPROVED`, `REJECTED`, `CANCELED`, `REFUNDED`
e `CHARGEBACK`; qualquer outro valor virava `PENDING`. Cada resultado sobrescrevia
payment e invoice. `APPROVED` completava checkout e ativava subscription;
`REFUNDED`/`CHARGEBACK` suspendiam-na. `version` era apenas incrementada, nunca
participava do `WHERE`. Webhook, sync e batch chamavam o mesmo método sem ordem.

## Máquina adotada

A precedência representa fases irreversíveis do ciclo de **um pagamento**, não
uma ordenação indiscriminada de estados de negócio:

1. `PENDING` (pré-decisão);
2. `REJECTED`, depois `CANCELED` apenas como desempate determinístico entre
   decisões pré-liquidação;
3. `APPROVED` (liquidado);
4. `REFUNDED` (reversão);
5. `CHARGEBACK` (contestação/reversão mais forte).

Assim: pending pode avançar; approved nunca volta a pending/rejected/canceled;
approved pode avançar a refunded/chargeback; refunded não volta a approved e
chargeback não volta a refunded. Evento idêntico é idempotente. Timestamp igual
usa a precedência acima. Isso faz qualquer permutação do mesmo conjunto
convergir ao maior estado válido.

## Política temporal e CAS

Mercado Pago fornece `date_last_updated` no recurso Payment; ele é persistido
como `providerOccurredAt`/`lastProviderEventAt`. Um timestamp menor é obsoleto.
Não se usa horário de recebimento como substituto. Se um ou ambos os snapshots
não têm timestamp, aplica-se somente a máquina conservadora: estados transitórios
ou terminais mais fracos não ganham autoridade por “último commit”. O conflito
fica observável em `BillingEvent.metadata` (`applied: false` e motivo), sem mudar
o estado efetivo.

A subscription é o lock do agregado. A aplicação faz `updateMany` filtrando
`id + tenantId + version` e exige `count === 1`. Quem perde aborta toda a
transação, recarrega checkout/subscription/payment e reavalia. Payment ainda usa
seu próprio `version` no update. Invoice, payment, checkout, subscription e
eventos são gravados na mesma transação curta; consultas ao gateway continuam
fora dela. A filial não integra o agregado de assinatura: sync resolve e valida
a filial pelo `TenantContextService`, enquanto as escritas são sempre vinculadas
ao `tenantId` derivado do checkout assinado, nunca a body/header.
