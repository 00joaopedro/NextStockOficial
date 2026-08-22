# MEM-016 — backpressure do processamento de imagens

## Fluxos protegidos

| Rota                                           | Multipart                                  |       Buffer | RC-008         | Sharp |                                         Variantes | Storage                  | Finalização                                                |
| ---------------------------------------------- | ------------------------------------------ | -----------: | -------------- | ----- | ------------------------------------------------: | ------------------------ | ---------------------------------------------------------- |
| `POST /api/products/:id/images/upload`         | `FastifyFileInterceptor`, 1 arquivo/5 MiB  | `toBuffer()` | antes do Sharp | sim   |                                    3, sequenciais | bucket atual de produtos | confirma; libera antes de upload ou reconcilia depois dele |
| `POST /api/pets/pets/:id/photos`               | `FastifyFileInterceptor`, 1 arquivo/5 MiB  | `toBuffer()` | antes do Sharp | sim   |                                    3, sequenciais | bucket atual de pets     | confirma; libera antes de upload ou reconcilia depois dele |
| `POST /api/expenses/:id/files/upload` (imagem) | `FastifyFileInterceptor`, 1 arquivo/10 MiB | `toBuffer()` | antes do Sharp | sim   | 3 criadas sequencialmente; somente `full` enviada | bucket atual de despesas | confirma; libera antes de upload ou reconcilia depois dele |

O upload de certificado A1 e anexos PDF/Word de despesas não executam Sharp e
não entram no coordenador MEM-016. XML/PDF fiscais são buffers gerados pelo
servidor, não uploads de imagem. Não há outra rota multipart no código atual.

Os guards de autenticação, papel, tenant e filial continuam executando antes do
controller. A limitação arquitetural atual é explícita: o interceptor multipart
chama `toBuffer()` antes de o service conhecer o tenant validado. Assim, o slot é
adquirido no primeiro ponto comum depois da resolução autoritativa de tenant e
antes de metadata/Sharp/reserva. O limite de arquivo do Fastify continua sendo a
primeira contenção da leitura. Mover a aquisição para antes de `toBuffer()` exige
transportar um lease tenant-scoped pelo interceptor e fica fora desta correção
focada; nenhuma transformação ou chamada externa ocorre antes do slot.

## Limites e política

- O semáforo é local à réplica: concorrência global `1` (máximo `4`), concorrência
  por tenant `1`, fila limitada `4`, espera `15 s` e processamento `30 s`.
- A fila preserva FIFO, mas pode ignorar temporariamente a cabeça bloqueada pelo
  limite do próprio tenant. Isso evita starvation de outros tenants sem criar
  estado distribuído para CPU local. Estado de tenant é removido quando zera.
- Configuração zero, negativa, não inteira, acima dos tetos ou inconsistente
  falha no bootstrap.
- O limite padrão é 20.000.000 pixels e o teto de configuração é 40.000.000.
  Dimensões inválidas, overflow seguro de `width * height` e o limite do próprio
  Sharp são verificados antes de qualquer transformação.
- JPEG, PNG e WebP estáticos são aceitos após detecção real. Imagens animadas e
  multipágina são rejeitadas. MIME/extensão não são usados como prova de formato.
- `sequentialRead` permanece ativo. Metadata e cada variante usam o timeout
  cancelável nativo do Sharp; a promise só termina após libvips encerrar. As três
  variantes deixaram de usar `Promise.all` e são produzidas sequencialmente.

Uma imagem RGBA de 20 milhões de pixels ocupa aproximadamente **80 MB somente
decodificada** (`20.000.000 × 4`), sem contar input comprimido, estruturas do
libvips e buffers WebP. Antes da MEM-016, cada requisição criava três variantes
em paralelo e não havia limite entre requisições, portanto a amplificação por
réplica era efetivamente ilimitada. Agora existe no máximo um decode/encode ativo
por padrão.

## RC-008, falhas e cleanup

A ordem é `slot → reserva persistente RC-008 → metadata/Sharp → Storage →
StoredFile → confirmação`. Como RC-008 não oferece redimensionamento de reserva,
é reservado conservadoramente o máximo configurado de output (3 MiB por arquivo)
antes do Sharp. Não foi criada tabela ou migration.

Rejeição/timeout de fila não cria reserva. Falha de reserva não inicia Sharp.
Falha de metadata/Sharp libera a reserva idempotentemente. Depois que qualquer
upload externo pode ter ocorrido, falha remove objetos parciais pelo protocolo
existente e marca `RECONCILIATION_REQUIRED`; o lease/claim de reservas vencidas
da RC-008 continua sendo a proteção contra crash da réplica. Confirmação e
liberação usam as transições idempotentes existentes. Slots e timers são
liberados em `finally`; pipelines são destruídos somente após settlement.

Saturação e timeout retornam `503`, com `Retry-After`; pixel bomb retorna `413`;
tipo/conteúdo inválido segue `400`. Mensagens não contêm caminho, bucket nem
detalhes libvips. `snapshot()` expõe instrumentação sanitizada de ativos, fila e
ativos por tenant para testes/métricas sem registrar arquivos ou PII.

## Rollout e rollback

1. Medir tamanho, pixels e duração atuais.
2. Iniciar com concorrência `1`, fila `4` e 20 MP.
3. Observar RSS, CPU, latência, saturações, `503` e reconciliação RC-008.
4. Aumentar para `2` somente com evidência de capacidade; nunca aumentar pixels
   e concorrência simultaneamente.
5. Alertar saturação prolongada e reservas em reconciliação.

Rollback reduz concorrência para `1`, fila e pixels. Nunca desabilita quota,
isolamento tenant ou permite concorrência ilimitada. Esta mudança não introduz
processamento assíncrono.
