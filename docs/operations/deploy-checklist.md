# Checklist de deploy

## Bloqueios

- secret scan, Prisma validate/generate, lint, build ou testes falhando;
- migration falhando em staging;
- teste cross-tenant falhando;
- novo `$queryRawUnsafe`/`$executeRawUnsafe` no runtime;
- staging usando identificadores de producao;
- backup requerido nao verificado.

## Sequencia

1. Revisar migration aditiva e impacto de lock/backfill.
2. Rodar CI. Vulnerabilidades criticas bloqueiam; altas geram relatorio e devem
   ter avaliacao/mitigacao registrada enquanto nao houver upgrade compativel.
3. Criar backup antes de migration relevante.
4. Aplicar migration por job unico em staging.
5. Executar smoke e validar audit events/RLS.
6. Aprovar producao.
7. Aplicar `npm run railway:migrate` por job unico.
8. Iniciar normalmente com `npm run start:railway`; esse comando nao migra.
9. Executar smoke e observar erros.

## Parte 2

- aplicar `20260705000000_sessions_and_stored_files` antes de habilitar
  `SESSION_ENFORCEMENT_ENABLED` ou `UPLOAD_ENABLE_QUOTAS`;
- iniciar com enforcement de sessao desabilitado, validar novos logins e depois
  ativar coordenadamente para evitar derrubar cookies legados sem aviso;
- validar `/api/health/ready`, logout atual/global, quota e inventario;
- relatorios de manutencao nao sao etapa automatica do runtime.

Rollback de release Railway nao reverte banco. Mudancas de schema devem ser
reparadas por roll-forward; uma reversao destrutiva exige runbook e backup
restauravel.
