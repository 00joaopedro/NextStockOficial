# Percentual de uso estimado do servidor

O Perfil mostra somente um percentual para administradores do tenant. Valores
monetários, IDs e a resposta da Railway não são enviados ao navegador.

## Limites fixos no código

`src/billing/server-usage-policy.ts` contém os limites mensais internos:

- Ouro: R$ 25;
- Esmeralda: R$ 50;
- Diamante: R$ 150.

Uma alteração exige revisão e deploy; não há painel para editar esses limites.

## Variáveis de produção

Além de `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID` e
`RAILWAY_SERVICE_ID`, configure:

- `RAILWAY_WORKSPACE_ID`: workspace que contém o projeto;
- `RAILWAY_USAGE_BRL_PER_USD`: cotação administrativa positiva, usada somente
  pelo backend;
- `RAILWAY_USAGE_SERVICE_IDS` (opcional): IDs separados por vírgula quando um
  serviço antigo e um novo precisam ser incluídos no mesmo ciclo. Sem ela, o
  sistema usa `RAILWAY_SERVICE_ID`.

O token deve ser restrito à leitura quando possível e nunca pode ser colocado
em HTML, JavaScript público ou logs.

## Leitura e indisponibilidade

O backend consulta os medidores de CPU, memória, egress, disco e backup da
Railway para o período de faturamento atual. O custo por tenant é uma
estimativa proporcional ao peso dos eventos operacionais registrados para cada
tenant. Não é uma medida física isolada de CPU/RAM.

Sem configuração válida, acesso à Railway, cotação ou eventos suficientes, a
API responde como indisponível. A página não converte isso em 0%.
