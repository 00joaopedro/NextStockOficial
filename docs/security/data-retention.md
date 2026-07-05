# Retencao de dados

- logs operacionais: 30–90 dias;
- usage identificavel: 90 dias;
- sessoes expiradas/revogadas: 120 dias, ajustavel;
- security audit: 12–24 meses;
- arquivos orfaos: quarentena de 7–30 dias;
- billing, vendas, fiscal e webhooks financeiros: prazo legal aprovado;
- backups: politica 7 diarios, 4 semanais e 6 mensais.

Os scripts desta fase sao report-only por padrao. `sessions:cleanup` so remove
quando `MAINTENANCE_APPLY=true`; em producao exige ainda
`ALLOW_PRODUCTION_MAINTENANCE=sessions:cleanup`.

Exclusao ou anonimizacao nao remove imediatamente copias em backups. A
expiracao geracional deve concluir essa remocao sem reintroduzir dados antigos
em restore posterior.
