# SEC-016 — rate limiting distribuído da autenticação

## Decisão e contrato preservado

Login (`5/min`), cadastro (`8/min`) e recuperação (`5/hora`) continuam com os
limites existentes. Somente esses três endpoints públicos usam a store PostgreSQL;
o limiter público genérico não foi ampliado. Cada tentativa consome um bucket por
IP e, quando há `email` textual, outro por conta. A resposta bloqueada é genérica,
HTTP 429, com `Retry-After` até o fim da janela fixa, sem distinguir conta existente.

## Algoritmo e identidades

Uma transação curta consome IP e conta com `INSERT ... ON CONFLICT DO UPDATE
... WHERE attempt_count < limit RETURNING`, parametrizado por `Prisma.sql`. Assim,
réplicas, alternância e restart compartilham exatamente a mesma franquia e disputas
não dependem de P2002. Os dois buckets são deliberadamente avaliados em toda
tentativa: um bucket já bloqueado não impede o consumo ainda possível do outro.

Emails são `trim` + lowercase, como na autenticação atual. IP vem exclusivamente de
`request.ip`; o guard nunca interpreta headers forwarded. IPv4-mapped IPv6 converge
com IPv4 e IPv6 válido é expandido para uma representação canônica. Ambos são
HMAC-SHA-256 com `AUTH_RATE_LIMIT_HMAC_SECRET`; texto bruto e hashes não entram em
logs.

## Proxy e configuração Railway

`TRUSTED_PROXY_HOPS` é inteiro de `0` a `10`; o default seguro `0` ignora forwarded
headers. O repositório não prova a quantidade/CIDRs dos proxies Railway. Antes do
rollout, a equipe deve validar a cadeia real e configurar exatamente seu número de
hops. Valores inválidos falham no bootstrap. Nunca usar um número maior “por
precaução”, pois isso permite ao cliente influenciar `request.ip`.

Configuração normal:

- `AUTH_RATE_LIMIT_ENABLED=true`
- `AUTH_RATE_LIMIT_STORE=postgres`
- `AUTH_RATE_LIMIT_HMAC_SECRET` aleatório, estável e com no mínimo 32 caracteres
- `TRUSTED_PROXY_HOPS` validado no Railway

Desabilitar é explícito e não ativa fallback em memória. Só fazê-lo em rollback se
uma proteção equivalente no edge estiver confirmadamente ativa. Falha da store é
fail-closed com HTTP 503 e mensagem genérica.

## Operação, métricas e capacidade

Logs JSON sanitizados registram configuração/restart lógico, ação, permitido,
bloqueado, tipo (`IP`/`ACCOUNT`), falha e latência PostgreSQL. Não incluem identidade,
payload ou hash. Buckets expirados têm índice e uma exclusão oportunista rara
(1/1024), não bloqueante, limitada a 500 linhas com `SKIP LOCKED`; a correção não
depende da limpeza.

Rollout: aplicar a migration em job controlado, validar `prisma migrate status`,
configurar secret/hops, implantar o código e observar 429/503/latência. Rollback:
reverter apenas o código (a tabela é expand-only e compatível), mantendo a migration;
desabilitar somente sob edge ativo. O risco principal é hotspot em IPs compartilhados.
Para aumentar capacidade, escalar PostgreSQL/pool, monitorar latência, ajustar a
frequência/lote da limpeza ou particionar operacionalmente a tabela; não desligar a
proteção nem elevar limites sem revisão de segurança.
