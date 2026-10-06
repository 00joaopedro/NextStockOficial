# Instalação do agente de impressão no Windows

A Etapa 1 fornece um instalador para Windows 10/11 de 64 bits:

`NextStock-Agente-Impressao-Setup.exe`

O instalador inclui o runtime Node.js e o agente compilado. O usuário não precisa instalar Node.js, NSSM ou executar comandos no PowerShell.

## Pré-requisitos

- Windows 10 ou Windows 11 de 64 bits.
- Impressora térmica instalada ou compartilhada pelo Windows.
- Permissão de administrador durante a instalação.
- O computador precisa conseguir acessar a impressora informada.

## Instalação

1. Execute o instalador como administrador.
2. Informe o compartilhamento da impressora, por exemplo:
   `\\localhost\Thermal80`.
3. Conclua a instalação.
4. O serviço `NextStockPrintAgent` será instalado e iniciado automaticamente.

O token do agente é gerado localmente e salvo em:

`C:\ProgramData\NextStock\PrintAgent\agent-token.txt`

Esse token deve ser informado no campo de token da tela de impressão direta. Ele nunca é embutido no JavaScript público.

## Diagnóstico

O serviço pode ser consultado em **Serviços do Windows** pelo nome:

`NextStockPrintAgent`

Os arquivos da fila e os logs ficam em:

`C:\ProgramData\NextStock\PrintAgent`

O instalador é restrito a Windows 10/11 x64. A distribuição para macOS, Linux ou Windows ARM não faz parte desta etapa.
