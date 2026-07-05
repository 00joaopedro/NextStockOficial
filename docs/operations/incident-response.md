# Resposta a incidentes

1. Classificar impacto, tenants, dados e periodo.
2. Preservar logs, audit events, request IDs e hashes; nao copiar secrets.
3. Conter: revogar chave/token, desabilitar webhook/feature ou isolar release.
4. Para suspeita cross-tenant, bloquear a rota e preservar IDs afetados.
5. Para billing/fiscal, suspender reconciliacao automatica antes de corrigir.
6. Recuperar por roll-forward ou restore ensaiado.
7. Validar isolamento, integridade, RLS e smoke antes de reabrir.
8. Rotacionar credenciais afetadas e documentar timeline/causa.

Eventos `CRITICAL`, Dev Support real, alteracao de role, chargeback, webhook
invalido repetido e download privado negado devem gerar alerta na futura camada
de observabilidade. Nao registrar senha, JWT, cookie, PFX, XML/PDF, signed URL
ou payload financeiro integral.

Em comprometimento de conta, use a revogacao de todas as sessoes do profile e
preserve os eventos `session.revoked_all`. Em malware suspeito, marque o
StoredFile como QUARANTINED, bloqueie o objeto no bucket e preserve somente
hash/metadados para investigacao.

O fluxo publico `forgot-password` apenas solicita email ao Supabase e nao
confirma localmente que a senha foi trocada; portanto ele nao revoga sessoes
nesse momento para evitar enumeracao/DoS. Reset administrativo de funcionario,
inativacao, demissao e alteracao de role revogam sessoes. A futura callback
server-side de confirmacao do Supabase deve revogar todas apos a troca efetiva.
