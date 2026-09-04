# Local primary: staging canary e rollback

Este PR somente prepara a ativação. O padrão continua `supabase_only`, o
canário começa em 0% e nenhuma variável real é alterada.

## Gate e operação

Depois de confirmar migrations, backup/retencão e aprovação humana, execute em
staging descartável ou controlado:

```text
npm run build:scripts
npm run auth:local-primary:readiness
```

O comando é somente leitura e retorna JSON sanitizado. `READY` exige JWT local,
modo explicitamente selecionado, confirmação explícita, recovery,
observabilidade, rollback, banco, source provider e evidência de conflitos e
ambiguidades. Ausência de evidência retorna `UNKNOWN`; qualquer bloqueador
impede a ativação.

O runtime lê variáveis no startup: alterar o modo exige restart/redeploy. A
progressão manual documentada é 0%, allowlist sintética, 1%, 5%, 25%, 50% e
100%. Cada passo exige aprovação, baseline comparável, sucesso de login,
recovery, logout/revogação, 5xx, conflitos, fallback e métricas dentro dos
limites previamente definidos. Sem baseline, os limites devem ser definidos
antes do rollout; não são inventados por este PR.

## Canário e rollback

O bucket usa HMAC com secret de pelo menos 32 caracteres; não use e-mail ou IDs
brutos em métricas. Denylist prevalece sobre allowlist. Secret ausente,
percentual inválido e evidência insegura bloqueiam a decisão. Não há rollout
automático.

Para rollback: interrompa a progressão, retorne o percentual a 0, configure
`AUTH_PROVIDER_MODE=coexistence`, reinicie o processo, execute smoke tests,
confira métricas/auditoria e preserve identidades e dados para investigação.
Não apague tabelas, sessões ou vínculos. O fallback legado deve ser explícito,
auditado e nunca um downgrade silencioso de falha técnica local.

Critérios de rollback incluem falha de login/recovery, 5xx, conflito,
regressão de sessão/logout, Google OAuth, métricas indisponíveis, exposição de
informação, readiness `NOT_READY`/`UNKNOWN` ou qualquer incidente de segurança.
