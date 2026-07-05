# Monitoramento e alertas

O backend emite logs JSON em stdout com timestamp, environment, release,
requestId, rota, status, duracao, ator, tenant, filial, outcome e errorCode.
Campos de authorization, cookies, senhas, tokens, secrets, certificados,
signed URLs e credenciais Mercado Pago sao removidos.

`SENTRY_DSN`, `SENTRY_ENVIRONMENT` e `SENTRY_RELEASE` estao reservados para uma
integracao futura com SDK oficial. Nesta fase nao ha envio externo: Railway
stdout e `security_audit_events` sao as fontes operacionais.

## Alertas prioritarios

- 5+ logins falhos por identidade/IP hash em 10 minutos;
- aumento de reset de senha, 401, 403 ou 402;
- qualquer tentativa cross-tenant repetida;
- rate limit, quota de upload ou signed URL negada;
- 500 em auth, estoque, vendas, billing ou fiscal;
- webhook invalido/FAILED/repetido, divergencia de valor/moeda/plano/collector;
- refund ou chargeback;
- Dev Support em tenant real e alteracao de role;
- migration, deploy, backup ou restore falhado;
- arquivos ORPHANED/QUARANTINED acima do limite;
- certificado A1 proximo do vencimento.

Endpoints:

- `GET /api/health`: liveness sem dependencias;
- `GET /api/health/ready`: readiness do PostgreSQL, sem detalhes de conexao.
