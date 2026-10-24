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

## Reserva Render e migração entre provedores

Não inclua IDs da Render em `RAILWAY_USAGE_SERVICE_IDS`. Para uma reserva
Render, configure somente no backend:

- `RENDER_API_KEY`: chave da API Render, mantida como segredo;
- `RENDER_USAGE_SERVICE_IDS`: IDs Render separados por vírgula;
- `RENDER_USAGE_CENTS_PER_HOUR_BY_SERVICE`: JSON com a estimativa em centavos
  de BRL por hora de cada ID. Exemplo: `{"srv-principal":25,"srv-reserva":25}`.

O backend consulta `instance-count` por serviço. Reserva fria (zero instâncias)
contribui R$ 0; reserva quente soma o custo das instâncias ativas. Em uma
migração Railway → Render, ambos os provedores são calculados no mesmo período
e somados antes da divisão proporcional por tenant. Séries sobrepostas de uma
mesma réplica não são somadas em duplicidade. Se a Render estiver configurada e
suas métricas não puderem ser verificadas, o percentual fica indisponível em vez
de reportar um valor artificialmente baixo.

## Leitura e indisponibilidade

O backend consulta os medidores de CPU, memória, egress, disco e backup da
Railway para o período de faturamento atual. O custo por tenant é uma
estimativa proporcional ao peso dos eventos operacionais registrados para cada
tenant. Não é uma medida física isolada de CPU/RAM.

Sem configuração válida, acesso à Railway, cotação ou eventos suficientes, a
API responde como indisponível. A página não converte isso em 0%.
