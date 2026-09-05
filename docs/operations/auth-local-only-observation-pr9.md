# `local_only`: preparação e observação

Este PR não ativa `AUTH_PROVIDER_MODE=local_only`, não altera ambientes reais e
não remove providers legados. O modo atual e o rollback permanecem seguros.

## Readiness

Execute somente em ambiente autorizado e após backup, migrations confirmadas,
aprovação humana e dry-run:

```text
npm run build:scripts
npm run auth:local-only:readiness
```

O relatório é sanitizado e identifica a origem da evidência como `synthetic`,
`staging` ou `production`. Ausência de evidência é `UNKNOWN`; fixture sintética
prova apenas o CI. O gate exige confirmação específica, JWT/kid, recovery,
observabilidade, rollback, ausência de conflitos/ambiguidades/estados
desconhecidos, observação prévia de `local_primary`, fallback desabilitado e
compatibilidade real com o startup. Enquanto o provider local de recovery não
estiver registrado e a validação de ambiente não aceitar o modo, o resultado é
`NOT_READY` por bloqueadores explícitos.

## Política do corte

Em `local_only`, somente credenciais locais podem criar sessões; erro, senha
inválida, usuário sem credencial ou falha técnica local nunca chama o provider
legado. Google, recovery, tenants, filiais, papéis, CSRF, rate limiting,
cookies HttpOnly, logout e revogação continuam sujeitos aos contratos internos.
Sessões legadas não devem ser renovadas; se não for possível distingui-las de
sessões locais, isso bloqueia o readiness. Nenhum encerramento em massa ocorre
neste PR.

## Observação, sucesso e rollback

A janela real, sua duração e os limites de sucesso devem ser definidos pelo
operador antes do rollout. Observe login local, recovery, Google, 5xx,
conflitos, fallback bloqueado, sessões legadas, logout, revogação e métricas.
Qualquer regressão, readiness `UNKNOWN`/`NOT_READY`, métrica indisponível,
dependência inesperada do legado ou incidente de segurança pausa o rollout.

Rollback: interrompa, retorne a `local_primary` se seguro ou a `coexistence`,
reabilite fallback somente conforme a configuração validada, reinicie se env é
lido no startup, execute smoke tests e preserve identidades, sessões e
evidências. Não apague dados nem faça limpeza do legado. Nenhuma etapa deve ser
executada na Railway pelo Codex.
