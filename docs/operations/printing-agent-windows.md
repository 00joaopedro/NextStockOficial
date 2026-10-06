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

O instalador é publicado automaticamente em uma GitHub Release quando uma tag no formato `print-agent-vX.Y.Z` é criada. Exemplo:

```bash
git tag print-agent-v1.0.0
git push origin print-agent-v1.0.0
```

Depois da conclusão do workflow, o botão da página NF-e usa o arquivo estável da release mais recente:
`https://github.com/00joaopedro/NextStockOficial/releases/latest/download/NextStock-Agente-Impressao-Setup.exe`.

