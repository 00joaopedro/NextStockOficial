# Agente local de impressão NextStock

O agente escuta somente em `127.0.0.1` e exige `NEXTSTOCK_PRINT_AGENT_TOKEN`. O navegador envia o token em `Authorization: Bearer`; nenhum segredo fica embutido no frontend.

## Simulação (antes da impressora real)

```powershell
$env:NEXTSTOCK_PRINT_AGENT_TOKEN = "gere-um-token-longo-e-aleatorio"
$env:NEXTSTOCK_PRINTER_MODE = "simulated"
npm run build:scripts
npm run printing:agent
```

Os bytes ESC/POS são gravados em `.nextstock-print/output`. A fila persiste em `.nextstock-print/queue.json`, deduplica por `idempotencyKey`, tenta até três vezes e registra `pending`, `sent`, `printed` ou `error`.

## Windows / impressora compartilhada

Configure `NEXTSTOCK_PRINTER_MODE=windows` e `NEXTSTOCK_PRINTER_SHARE` com o compartilhamento da impressora (por exemplo `\\localhost\Thermal80`) e execute `install-windows-service.ps1` como administrador. O driver/compartilhamento do Windows continua sendo responsável pelo spool físico.

Para a aplicação publicada, defina `NEXTSTOCK_PRINT_AGENT_ORIGINS` com os domínios exatos usados pelo NextStock. O padrão permite `nextstocks.online`, `www.nextstocks.online` e localhost.
