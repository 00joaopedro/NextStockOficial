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
migração Railway → Render, ambos os provedores são calculados no mesmo período, rateados separadamente
pela atividade da respectiva origem e depois somados por tenant. Séries sobrepostas de uma
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

## Origem, histórico e painel Dev

Os eventos novos identificam automaticamente o servidor por variáveis de instância
fornecidas pela Railway ou Render. Os eventos históricos sem origem permanecem
como desconhecidos; não se tenta adivinhar. O interceptor registra requisições
bem-sucedidas com usuário autenticado e contexto de tenant validado, além dos
eventos já instrumentados; exclui o próprio registro de page-view e não salva
parâmetros da URL. Nem toda atividade ou custo é identificável: acesso anônimo,
falhas antes dos guards, processos em segundo plano e uso ocioso podem ficar de
fora. Os valores são rateios estimados, nunca custo físico ou cobrança por usuário.

O backend coleta periodicamente até seis dias recentes da API Render, armazena
amostras horárias no banco compartilhado e usa gravação idempotente entre réplicas.
Apenas horas encerradas entram no cálculo; o horário de atualização corresponde
à última hora encerrada. Na ausência de qualquer amostra necessária, o custo é
indisponível. Um início com histórico insuficiente, indisponibilidade prolongada
ou limites de retenção da API pode deixar lacunas permanentes. As amostras antigas
não podem ser recuperadas depois de vencida a retenção do provedor. A taxa atual
configurada é aplicada ao histórico; alterações de preço não são retroativas de
forma precisa. O custo é estimado por instâncias, não uma fatura completa.

Falhas de gravação de eventos são sinalizadas sem detalhes sensíveis e a lacuna é
gravada no banco quando a instância volta a gravar. Um período com lacuna gravada
ou origem desconhecida fica indisponível para rateio. Se a instância encerrar
antes de recuperar o banco, a lacuna em memória pode não ser persistida; portanto,
a ausência de alerta não prova coleta completa. O sistema permanece operacional
caso a coleta falhe.

Para Railway, o painel Dev usa `DEV_RAILWAY_MONTHLY_COST_CENTS` como base
administrativa estimada; o percentual no perfil usa a consulta de uso da Railway.
Para Render, configure a API, IDs e taxas nos **dois serviços de aplicação**;
segredos do GitHub Actions não são variáveis de runtime. `GET /api/dev/health`,
restrito ao Dev SuperAdmin, informa apenas nomes ausentes no servidor que atende
a requisição. Presença de nomes não prova que valores ou permissões estão corretos.
Os totais por usuário são estimativas por linha, período e origem. Não os use
para cobrança ou como medição exata do uso individual.

Após o deploy e a aplicação das migrations pelo workflow, verifique no painel
Dev o diagnóstico de cada servidor e confira uma atividade autenticada em cada
origem. Nunca imprima tokens, URLs de banco ou payloads nas verificações. A coleta
histórica funciona enquanto ao menos uma instância configurada executa o serviço;
interrupções acima da retenção não são automaticamente recuperáveis.
