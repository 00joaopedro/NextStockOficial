param(
  [string]$NodePath = "node",
  [string]$AgentScript = "$PSScriptRoot\..\..\dist\scripts\printing\agent.js",
  [string]$Token = ""
)

if ([string]::IsNullOrWhiteSpace($Token)) { throw "Informe um token forte em -Token." }
$binPath = "`"$NodePath`" `"$AgentScript`""
sc.exe create NextStockPrintAgent binPath= $binPath start= auto DisplayName= "NextStock Print Agent" | Out-Host
sc.exe failure NextStockPrintAgent reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Host
[Environment]::SetEnvironmentVariable("NEXTSTOCK_PRINT_AGENT_TOKEN", $Token, "Machine")
Write-Host "Serviço instalado. Configure NEXTSTOCK_PRINTER_MODE=windows e NEXTSTOCK_PRINTER_SHARE antes de iniciar."
