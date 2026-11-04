# Consumo estimado por ciclo do cliente

A versão `cycle-v1` usa `period_started_at` e `period_ends_at` das faturas
pagas. Não usa o mês civil nem o ciclo financeiro do workspace Railway como
substitutos. A consulta Railway recebe exatamente o intervalo do cliente.

O processo de API em produção avalia automaticamente até 20 faturas encerradas
a cada cinco minutos. Aguarda uma hora após o encerramento; pendências podem
ser reavaliadas após uma hora. Intervalos superiores a 62 dias são registrados
como indisponíveis. Não há reconstrução inventada de ciclos anteriores ao marco
de coleta gravado pela migration. Um ciclo mensal novo precisa decorrer para
existir uma estimativa mensal desta versão.

Cada provedor é rateado apenas pelo peso dos eventos de sua própria origem.
Eventos sem tenant/origem, lacunas conhecidas, custo positivo sem atividade,
janela incorreta, erro de API ou amostras Render sem taxa registrada impedem
o cálculo. A taxa zero é válida; ausência de taxa não significa zero.
Railway é convertida para BRL com a cotação administrativa configurada. A
taxa Render é informada em centavos de BRL por instância-hora e registrada
junto da amostra. A taxa registrada representa a estimativa administrativa
observada na coleta, não uma comprovação do preço cobrado pelo provedor.
Não se substitui uma taxa registrada por outra configurada depois.

`billing_usage_cycles` guarda o intervalo, estado, custo em centavos de BRL e
evidências. A chave da fatura é única e a relação composta impede vincular
um resultado à fatura de outro tenant. Estimativas já armazenadas não são
reprecificadas automaticamente. Registros indisponíveis podem ser reavaliados.

`GET /api/billing/subscription/server-usage` acrescenta `lastCompletedCycle`
ao resumo existente, usando o tenant autenticado. O resumo não expõe valores
monetários nem evidências internas. Seleciona o último ciclo encerrado da
assinatura atual, mesmo se a fatura tiver sido estornada; não recua para uma
fatura antiga mais barata.

Os resultados são `ESTIMATED` ou `UNAVAILABLE`. Não são medição física
individual, fatura do provedor nem prova de que toda atividade foi registrada.
Ausência de lacunas conhecidas não prova ausência de perda de eventos durante
uma queda. O campo `eligibleForDowngrade` permanece sempre `false`; a integração
de downgrade pertence ao próximo PR e precisa decidir como tratar essa incerteza.

## Implantação

Aplicar `20261104190000_billing_usage_cycles` pelo job controlado de migrations
antes do deploy, nunca no boot HTTP. A migration cria o marco inicial uma única
vez, preserva amostras antigas sem lhes atribuir preços inventados e restringe
as novas tabelas ao backend. Confira permissões do usuário de runtime se ele
não for proprietário das tabelas nem tiver bypass de RLS.

Variáveis de runtime das APIs Railway/Render e respectivas taxas devem existir
nos dois servidores. O diagnóstico `GET /api/dev/health` continua restrito ao
Dev SuperAdmin. `HTTP_401` indica resposta da API, não qualquer falha genérica.
O backend não pode corrigir uma chave recusada nem recuperar amostras que o
provedor não disponibiliza. Não é necessário efetuar transação Mercado Pago
para testar esta atualização. Os testes usam provedores simulados; o CI deve
validar a migration e o isolamento com PostgreSQL antes do merge.
