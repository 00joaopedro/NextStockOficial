# Staging isolado

Staging usa recursos fisicamente separados de producao: projeto Supabase,
ambiente/servico Railway, Mercado Pago sandbox, buckets, secrets e dominio.
Nunca copie PII, dumps de producao, certificados A1 reais ou `service_role` de
producao.

## Configuracao

1. Crie um projeto Supabase exclusivo e registre seu ref em
   `SUPABASE_PROJECT_REF` e `STAGING_SUPABASE_PROJECT_REF`.
2. Informe o ref de producao somente em `PRODUCTION_SUPABASE_PROJECT_REF`, para
   o guardrail detectar cruzamentos.
3. Crie Railway staging com `NODE_ENV=production` e `APP_ENV=staging`.
4. Use `.env.staging.example` como inventario, nunca como arquivo de secrets.
5. Use dominio/CORS, JWT, audit hash secret, billing secret e buckets exclusivos.
6. Configure `MERCADO_PAGO_MODE=sandbox`, webhooks e credenciais de teste.

O boot falha se o ref nao combinar com a URL Supabase, se staging usar o ref ou
host declarados como producao, ou se Mercado Pago estiver em modo production.
O project ref/URL e a ancora para impedir reutilizacao da `service_role`; a chave
isoladamente nao revela de forma confiavel a qual projeto pertence.

## Promocao

1. CI verde.
2. `npm run railway:migrate` em staging.
3. Smoke: health, login, tenant A/B, produto, pedido, venda, arquivo privado,
   billing sandbox e fiscal mock.
4. Backup de producao verificado.
5. Aprovacao manual.
6. Job unico `npm run railway:migrate` em producao.
7. Deploy da aplicacao com `npm run start:railway`.
8. Smoke e monitoramento pos-deploy.

Nunca execute testes security contra URL que nao contenha `test`, `security` ou
`ci`. O helper tambem rejeita host remoto sem opt-in explicito.

Depois da migration da Parte 2, valide primeiro com
`SESSION_ENFORCEMENT_ENABLED=false`. Faça login novo, confirme os cookies
`jwt` e `nextstock_session`, ative enforcement e execute logout/logout-all.
Habilite quotas apenas depois de gerar `uploads:quota-report`.
