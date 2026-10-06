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
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
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

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -PrinterShare ""{code:GetPrinterShare}"""; StatusMsg: "Instalando o serviço do agente..."; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall"; RunOnceId: "RemoveNextStockPrintAgent"; Flags: runhidden waituntilterminated

[Code]
var
  PrinterPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  PrinterPage := CreateInputQueryPage(
    wpSelectDir,
    'Configuração da impressora',
    'Informe o compartilhamento da impressora Windows',
    'O agente precisa acessar uma impressora compartilhada pelo Windows. Exemplo: \\localhost\Thermal80'
  );
  PrinterPage.Add('Compartilhamento da impressora:', False);
  PrinterPage.Values[0] := '\\localhost\Thermal80';
end;

function GetPrinterShare(Param: String): String;
begin
  Result := PrinterPage.Values[0];
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
    end;
  end;
end;
