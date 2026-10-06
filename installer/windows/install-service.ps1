[CmdletBinding()]
param(
  [string]$PrinterShare,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$serviceName = "NextStockPrintAgent"
$installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceExe = Join-Path $installRoot "$serviceName.exe"
$serviceXml = Join-Path $installRoot "$serviceName.xml"
$programDataRoot = Join-Path $env:ProgramData "NextStock\PrintAgent"
$queueFile = Join-Path $programDataRoot "queue.json"
$tokenFile = Join-Path $programDataRoot "agent-token.txt"

function Invoke-WinSw {
  param(
    [string[]]$Arguments,
    [string]$Action
  )

  & $serviceExe @Arguments 2>$null
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Falha ao executar '$Action' no serviço do agente (código $exitCode)."
  }
}

function Get-ExistingAgentService {
  return Get-Service -Name $serviceName -ErrorAction SilentlyContinue
}

if ($Uninstall) {
  $existingService = Get-ExistingAgentService
  if ($existingService -and -not (Test-Path $serviceExe)) {
    throw "O serviço está registrado, mas o executável do agente não foi encontrado. Os dados foram preservados."
  }

  if ($existingService) {
    Invoke-WinSw -Arguments @("stop") -Action "parar"
    Invoke-WinSw -Arguments @("uninstall") -Action "desregistrar"
  }

  if (Get-ExistingAgentService) {
    throw "O serviço ainda está registrado. A fila e o token foram preservados."
  }

  Remove-Item $programDataRoot -Recurse -Force -ErrorAction Stop
  exit 0
}

if ([string]::IsNullOrWhiteSpace($PrinterShare)) {
  throw "Informe o compartilhamento da impressora, por exemplo: \\localhost\Thermal80"
}

$shareMatch = [regex]::Match($PrinterShare, '^\\\\([^\\]+)\\([^\\]+)$')
if (-not $shareMatch.Success) {
  throw "Use um compartilhamento Windows no formato \\localhost\NomeDaImpressora."
}
$shareHost = $shareMatch.Groups[1].Value
$localHosts = @("localhost", "127.0.0.1", ".", $env:COMPUTERNAME)
if ($localHosts -notcontains $shareHost) {
  throw "Nesta versão o agente aceita somente compartilhamentos locais do próprio computador. Compartilhamentos remotos exigem configuração de identidade do serviço."
}

if (-not (Test-Path $serviceExe)) {
  throw "O instalador está incompleto: serviço Windows não encontrado."
}

New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null

$existingService = Get-ExistingAgentService
if ($existingService) {
  Invoke-WinSw -Arguments @("stop") -Action "parar"
  Invoke-WinSw -Arguments @("uninstall") -Action "desregistrar"
}

$token = $null
if (Test-Path $tokenFile) {
  $token = (Get-Content -Raw -Path $tokenFile).Trim()
}
if ([string]::IsNullOrWhiteSpace($token)) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
  Set-Content -Path $tokenFile -Value $token -Encoding ascii
}

$escapedShare = [System.Security.SecurityElement]::Escape($PrinterShare)
$escapedQueue = [System.Security.SecurityElement]::Escape($queueFile)
$escapedLogPath = [System.Security.SecurityElement]::Escape((Join-Path $programDataRoot "logs"))
$xml = @"
<service>
  <id>$serviceName</id>
  <name>NextStock Print Agent</name>
  <description>Agente local de impressão ESC/POS do NextStock.</description>
  <executable>%BASE%\node\node.exe</executable>
  <arguments>"%BASE%\agent\agent.js"</arguments>
  <workingdirectory>%BASE%\agent</workingdirectory>
  <logpath>$escapedLogPath</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec" />
  <env name="NEXTSTOCK_PRINT_AGENT_TOKEN" value="$token" />
  <env name="NEXTSTOCK_PRINTER_MODE" value="windows" />
  <env name="NEXTSTOCK_PRINTER_SHARE" value="$escapedShare" />
  <env name="NEXTSTOCK_PRINT_AGENT_PORT" value="17890" />
  <env name="NEXTSTOCK_PRINT_QUEUE_FILE" value="$escapedQueue" />
</service>
"@
Set-Content -Path $serviceXml -Value $xml -Encoding UTF8

Invoke-WinSw -Arguments @("install") -Action "instalar"
Invoke-WinSw -Arguments @("start") -Action "iniciar"

Write-Output "NextStock Print Agent instalado."
Write-Output "Token salvo em: $tokenFile"
