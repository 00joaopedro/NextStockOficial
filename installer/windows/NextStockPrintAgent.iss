; NextStock Print Agent - Windows 10/11 64-bit installer
#define MyAppName "NextStock Print Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "NextStock"
#define MyAppExeName "NextStockPrintAgent.exe"

[Setup]
AppId={{7C0B1D56-7E89-4E4D-BD1C-4D5E1C7A2A11}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\NextStock\PrintAgent
DefaultGroupName=NextStock
DisableProgramGroupPage=yes
PrivilegesRequired=admin
MinVersion=10.0
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
OutputDir=output
OutputBaseFilename=NextStock-Agente-Impressao-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName}
SetupLogging=yes

[Files]
Source: "staging\NextStockPrintAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\NextStockPrintAgent.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\install-service.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "staging\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "staging\agent\*"; DestDir: "{app}\agent"; Flags: recursesubdirs ignoreversion

[Code]
var
  PrinterPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PrinterPage := CreateInputQueryPage(
    wpSelectDir,
    'Configuração da impressora',
    'Informe o compartilhamento da impressora Windows',
    'Use um compartilhamento local do próprio computador. Exemplo: \\localhost\Thermal80'
  );
  PrinterPage.Add('Compartilhamento da impressora:', False);
  PrinterPage.Values[0] := '\\localhost\Thermal80';
end;

function GetPrinterShare(Param: String): String;
begin
  Result := PrinterPage.Values[0];
end;

function RunAgentScript(UninstallMode: Boolean): Boolean;
var
  ResultCode: Integer;
  Params: String;
  ScriptPath: String;
begin
  ScriptPath := ExpandConstant('{app}\install-service.ps1');
  if UninstallMode then
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '" -Uninstall'
  else
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath + '" -PrinterShare "' + PrinterPage.Values[0] + '"';

  Result := Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Params,
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) and (ResultCode = 0);

  if not Result then
    MsgBox('O agente não foi instalado/removido corretamente. Nenhuma operação de merge foi realizada; verifique o log do instalador e tente novamente.', mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not RunAgentScript(False) then
      Abort;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := RunAgentScript(True);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PrinterPage.ID then
  begin
    if Trim(PrinterPage.Values[0]) = '' then
    begin
      MsgBox('Informe o compartilhamento da impressora para continuar.', mbError, MB_OK);
      Result := False;
    end
    else if Pos('"', PrinterPage.Values[0]) > 0 then
    begin
      MsgBox('O compartilhamento não pode conter aspas.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;
