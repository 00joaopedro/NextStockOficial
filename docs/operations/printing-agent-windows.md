# Instalação do agente de impressão no Windows

A Etapa 1 fornece um instalador para Windows 10/11 de 64 bits:

`NextStock-Agente-Impressao-Setup.exe`

O instalador inclui o runtime Node.js e o agente compilado. O usuário não precisa instalar Node.js, NSSM ou executar comandos no PowerShell.

## Pré-requisitos

- Windows 10 ou Windows 11 nativo de 64 bits.
- Impressora térmica instalada ou compartilhada pelo próprio Windows.
- Permissão de administrador durante a instalação.
- O computador precisa conseguir acessar a impressora informada.

Nesta primeira versão, o instalador aceita somente compartilhamentos locais do próprio computador, como `\\localhost\Thermal80`. Compartilhamentos hospedados em outro computador ou servidor exigem uma configuração posterior de identidade/credenciais do serviço.

## Instalação

1. Execute o instalador como administrador.
2. Informe o compartilhamento local da impressora, por exemplo:
   `\\localhost\Thermal80`.
3. Conclua a instalação.
4. O serviço `NextStockPrintAgent` será instalado e iniciado automaticamente.

Se o serviço não puder ser registrado ou iniciado, a instalação será interrompida e o erro deverá ser corrigido antes de concluir.

O token do agente é gerado localmente e salvo em:

`C:\ProgramData\NextStock\PrintAgent\agent-token.txt`

Esse token deve ser informado no campo de token da tela de impressão direta. Ele nunca é embutido no JavaScript público.

## Desinstalação segura

A desinstalação primeiro tenta parar e desregistrar o serviço. Se qualquer comando falhar, a desinstalação é interrompida e a fila persistente e o token são preservados.

## Diagnóstico

O serviço pode ser consultado em **Serviços do Windows** pelo nome:

`NextStockPrintAgent`

Os arquivos da fila e os logs ficam em:

`C:\ProgramData\NextStock\PrintAgent`

O instalador é restrito a Windows 10/11 x64 nativo. A distribuição para macOS, Linux ou Windows ARM não faz parte desta etapa.

## Publicação do instalador

O workflow gera o arquivo `NextStock-Agente-Impressao-Setup.exe` como artefato do build Windows. Antes de disponibilizar aos usuários, um mantenedor deve baixar esse artefato e anexá-lo manualmente a uma GitHub Release. O botão da página NF-e abre a página oficial de releases para que o usuário baixe a versão publicada.
## Estados do spooler Windows

O agente consulta o spooler local com `Get-PrintJob` após enviar o arquivo RAW. A fila pode informar:

- `accepted`: o envio foi aceito, mas o job ainda não foi localizado;
- `spooled`: o job foi localizado na fila do Windows e seu identificador foi salvo;
- `printed`: o job saiu da fila após ter sido identificado;
- `error`: o spooler informou falha conhecida;
- `unknown`: o spooler não respondeu ou o tempo de consulta terminou.

A consulta do spooler melhora a rastreabilidade, mas não confirma fisicamente a saída do papel. Estados `unknown` continuam exigindo confirmação manual e não são reenviados automaticamente.


## Compatibilidade ESC/POS

O agente converte o conteúdo HTML para texto de recibo antes do envio RAW:

- 58 mm usa 32 colunas e 80 mm usa 48 colunas;
- a quebra respeita a largura visual, inclusive para caracteres largos;
- o código de página padrão é CP858, com acentos portugueses e euro;
- CP850 continua disponível quando a impressora exigir esse perfil;
- o comando de corte completo é enviado após três linhas de avanço;
- o agente não confirma fisicamente a saída do papel: essa limitação continua dependente da impressora.

A fila grava uma cópia ".bak" do último estado válido antes de substituir o arquivo principal. Após reiniciar o agente, trabalhos pendentes são retomados e, se o arquivo principal estiver inválido, a última cópia válida é carregada.
