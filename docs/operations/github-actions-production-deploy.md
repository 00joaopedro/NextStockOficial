# Deploy de produção pelo GitHub Actions

O workflow `Deploy production` é a fonte única de orquestração de produção. Ele é iniciado automaticamente somente quando o workflow `CI security` termina com sucesso na branch `main`; também pode ser iniciado manualmente em **Actions → Deploy production → Run workflow**.

## Ordem garantida

1. bloqueia outra execução concorrente;
2. faz checkout do SHA aprovado pelo CI;
3. executa `npm run production:migrate` contra o banco de produção;
4. inicia Railway e Render em paralelo, ambos para o mesmo SHA;
5. aguarda cada provedor e exige `GET /api/health/ready`.

A migration é neutra ao provedor. `railway:migrate` permanece apenas como alias de compatibilidade para `production:migrate`. Nem o build nem o start da Render executam migrations.

## Segredos exigidos no GitHub Actions

- Banco e proteção da migration: `DATABASE_URL`, `DIRECT_URL`, `ADMIN_DATABASE_URL`, `SUPABASE_PROJECT_REF`, `PRODUCTION_SUPABASE_PROJECT_REF`.
- Railway: `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_HEALTHCHECK_URL`.
- Render: `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `RENDER_HEALTHCHECK_URL`.

Os dois secrets de healthcheck devem apontar para `/api/health/ready`. O workflow não imprime valores, URLs de banco, tokens ou respostas de API; somente estados operacionais.

## Falha e recuperação

- **Migration falhou:** nenhum deploy é iniciado. Corrija a migration/configuração e rode novamente após o CI verde.
- **Railway falhou e Render passou:** o sistema pode continuar disponível pela Render; corrija Railway e faça um novo dispatch somente depois de confirmar o SHA na main.
- **Render falhou e Railway passou:** o sistema pode continuar disponível pela Railway; corrija Render e rode novamente depois de confirmar o SHA na main.
- **Readiness falhou:** trate o provedor como não pronto. Consulte os logs diretamente no provedor, sem copiar secrets para o GitHub Actions.
- **Execução interrompida:** a concorrência não cancela releases em andamento. Aguarde o fim e então use o dispatch manual, que sempre usa a main atual.

Quando o Cloudflare Load Balancer for adotado, troque ambos os healthchecks por uma estratégia coerente de origem/rota. Não é necessário alterar a ordem de migrations ou o gatilho do workflow.
