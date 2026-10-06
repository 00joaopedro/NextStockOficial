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

New-Item -ItemType Directory -Force -Path $programDataRoot | Out-Null

if ($Uninstall) {
  if (Test-Path $serviceExe) {
    & $serviceExe stop 2>$null
    & $serviceExe uninstall 2>$null
  }
  Remove-Item $programDataRoot -Recurse -Force -ErrorAction SilentlyContinue
  exit 0
}

if ([string]::IsNullOrWhiteSpace($PrinterShare)) {
  throw "Informe o compartilhamento da impressora, por exemplo: \\localhost\Thermal80"
}

if (-not (Test-Path $serviceExe)) {
  throw "O instalador está incompleto: serviço Windows não encontrado."
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
$xml = @"
<service>
  <id>$serviceName</id>
  <name>NextStock Print Agent</name>
  <description>Agente local de impressão ESC/POS do NextStock.</description>
  <executable>%BASE%\node\node.exe</executable>
  <arguments>"%BASE%\agent\agent.js"</arguments>
  <workingdirectory>%BASE%\agent</workingdirectory>
  <logpath>$programDataRoot\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
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

if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
  & $serviceExe stop 2>$null
  & $serviceExe uninstall 2>$null
}
& $serviceExe install
if ($LASTEXITCODE -ne 0) { throw "Não foi possível registrar o serviço do agente." }
& $serviceExe start
if ($LASTEXITCODE -ne 0) { throw "O serviço foi instalado, mas não iniciou." }

Write-Output "NextStock Print Agent instalado."
Write-Output "Token salvo em: $tokenFile"
