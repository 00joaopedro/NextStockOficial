# Migração assistida de produtos do Firebird

O conversor roda com Firebird 3 embarcado. Ele recebe uma cópia de banco
compatível (normalmente `.fdb`, até 64 MB), lista tabelas e colunas e produz
um CSV de até 5 MB e 10.000 produtos. Não use o arquivo aberto pelo sistema
legado. Se a origem só oferece backup `.fbk`, restaure-o com a versão compatível
em um ambiente separado antes de usar o conversor. Para versões incompatíveis,
use o exportador do sistema legado. Não envie o banco inteiro ao NextStock.

Execute com Docker em um computador de suporte autorizado, a partir da raiz
do repositório. O arquivo de entrada precisa estar legível pelo usuário do
contêiner. O exemplo abaixo é para Bash:

```bash
docker build -f tools/firebird-import/Dockerfile -t nextstock-firebird-import .
source_fdb="$(realpath /caminho/copia.fdb)"
firebird_import() {
  timeout 60 docker run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=96m \
    --memory 256m --cpus 1 --pids-limit 64 \
    --mount "type=bind,src=$source_fdb,dst=/input/source.fdb,readonly" \
    nextstock-firebird-import "$@"
}
firebird_import
firebird_import --table PRODUTOS
firebird_import --table PRODUTOS --column NOME --column CODIGO \
  --column CUSTO --column VENDA --column ESTOQUE > produtos-firebird.csv
```

Substitua os nomes acima pelos nomes retornados para a base do cliente.
Selecione somente os campos necessários. Envie o CSV diretamente em **Migração**,
mapeie os campos, confira a prévia e confirme na filial atual. Não regrave
o CSV no Excel se quiser preservar zeros à esquerda nos códigos.

O contêiner não recebe credenciais do NextStock nem acesso à rede. Ele abre
uma cópia temporária em uma transação de leitura, com gatilhos de banco
desativados, e não exporta views, campos calculados, arrays ou BLOBs.

## Firebird antigo

A extensão do arquivo não indica a versão interna. Para uma base incompatível
(por exemplo, Firebird 2.5), prefira exportar a tabela de produtos para CSV no
sistema antigo. Se o suporte precisar converter uma cópia, gere o backup com o
`gbak` da versão original e restaure-o em um **arquivo novo** com o `gbak` da
versão de destino, em um ambiente separado. Não atualize nem substitua a base
ativa do cliente. Bancos criptografados ou com metadados incompatíveis podem
precisar de ajuda do fornecedor.

## Envio direto opcional pela página Migração

Provisionar o leitor como **serviço separado e privado**, a partir do Dockerfile
desta pasta, executando `python /tool/server.py` em substituição ao ENTRYPOINT.
O leitor não deve receber credenciais do aplicativo, acesso ao banco NextStock
ou volumes compartilhados. Use rede privada com acesso de entrada apenas pelo
backend e bloqueio de saída, usuário sem privilégios, sistema de arquivos só
leitura, /tmp temporário, limites de memória e CPU. Configure `PORT` se necessário.

Defina `NEXTSTOCK_FIREBIRD_READER_TOKEN` (um segredo aleatório de pelo menos
32 caracteres, exclusivo do leitor) no leitor e no backend. Configure
`NEXTSTOCK_FIREBIRD_READER_URL` no backend para a origem privada do leitor,
sem caminho. Use HTTPS se o transporte não for restrito à rede privada.
A opção .fdb só é anunciada com essa configuração. Sem leitor, CSV permanece
disponível. Para o envio direto há limite de 5 MB no arquivo, e a leitura é
temporária; o catálogo só muda quando o administrador confirma a importação.
