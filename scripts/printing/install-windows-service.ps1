param(
  [string]$NodePath = "node",
  [string]$AgentScript = "$PSScriptRoot\..\..\dist\scripts\printing\agent.js",
  [string]$Token = "",
  [string]$NssmPath = "nssm.exe"
)

if ([string]::IsNullOrWhiteSpace($Token)) { throw "Informe um token forte em -Token." }
if (-not (Get-Command $NssmPath -ErrorAction SilentlyContinue)) {
  throw "Instale o NSSM (https://nssm.cc) ou informe o caminho em -NssmPath."
}
nssm.exe install NextStockPrintAgent $NodePath $AgentScript | Out-Host
nssm.exe set NextStockPrintAgent AppDirectory (Split-Path -Parent $AgentScript) | Out-Host
nssm.exe set NextStockPrintAgent Start SERVICE_AUTO_START | Out-Host
nssm.exe set NextStockPrintAgent AppExit Default Restart | Out-Host
nssm.exe set NextStockPrintAgent AppEnvironmentExtra "NEXTSTOCK_PRINT_AGENT_TOKEN=$Token" "NEXTSTOCK_PRINTER_MODE=windows" | Out-Host
[Environment]::SetEnvironmentVariable("NEXTSTOCK_PRINT_AGENT_TOKEN", $Token, "Machine")
Write-Host "Serviço instalado via NSSM. Configure NEXTSTOCK_PRINTER_SHARE e inicie NextStockPrintAgent."
