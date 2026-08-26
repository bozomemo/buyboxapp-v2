; BuyBox — Windows installer (docs/14-deployment.md §5)
;
; Compiled by build-package.ps1, which assembles installer\staging first. Compiling this file
; on its own produces nothing useful — the payload does not exist until that script has run.
;
; The Pascal below stays thin on purpose. Preflight, environment, service registration and
; health verification each live in their own PowerShell script under scripts\, where they can be
; read, run and fixed without recompiling an installer.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppName "BuyBox"
#define DataDir "{commonappdata}\BuyBox"

[Setup]
AppId={{8C4F1E62-3D7A-4B21-9E55-0A6B7C2D9F31}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=BuyBox
DefaultDirName={autopf}\BuyBox
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputBaseFilename=BuyBoxSetup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
; Bundled Node, Chromium and native modules are all x64 (doc 14 §3).
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Writes to Program Files and registers a service.
PrivilegesRequired=admin
UninstallDisplayName={#AppName}
WizardStyle=modern
SetupLogging=yes

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Files]
Source: "staging\app\*";      DestDir: "{app}\app";      Flags: recursesubdirs createallsubdirs ignoreversion
Source: "staging\node\*";     DestDir: "{app}\node";     Flags: recursesubdirs createallsubdirs ignoreversion
Source: "staging\chromium\*"; DestDir: "{app}\chromium"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "staging\scripts\*";  DestDir: "{app}\scripts";  Flags: recursesubdirs createallsubdirs ignoreversion
Source: "staging\service\*";  DestDir: "{app}\service";  Flags: recursesubdirs createallsubdirs ignoreversion
; Preflight runs before anything is installed (InitializeSetup), and stop-service before the
; first file is replaced (PrepareToInstall). Both need a copy the wizard can extract to {tmp}
; rather than one that only exists after the files are laid down -- and on an upgrade the copy
; under {app} is the *previous* version's, which is not the one we want to run either.
Source: "preflight.ps1";    Flags: dontcopy
Source: "stop-service.ps1"; Flags: dontcopy

[InstallDelete]
; Doc 14 section 5 step 3: on an upgrade {app} is emptied before the new payload lands, so a file
; this version no longer ships cannot survive into it -- a stale Next chunk or an orphaned
; Chromium file is loaded exactly as if it belonged. Safe only because PrepareToInstall has
; already stopped the service.
;
; {app}\service is deliberately not here: it holds BuyBoxApp.xml, which install-service.ps1
; renders and refreshes, and its two shipped files are overwritten by [Files] anyway. Deleting a
; registered service's own executable buys nothing and risks a "marked for deletion" service.
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\chromium"
Type: filesandordirs; Name: "{app}\scripts"

[Dirs]
; Data lives outside {app} so an upgrade, which replaces {app} wholesale, cannot reach it
; (doc 14 §4). `uninsneveruninstall` keeps it when the product is removed; the uninstaller
; deletes it only if the operator explicitly asks (see CurUninstallStepChanged).
Name: "{#DataDir}";        Flags: uninsneveruninstall
Name: "{#DataDir}\logs";   Flags: uninsneveruninstall

[Icons]
Name: "{group}\BuyBox";           Filename: "http://127.0.0.1:{code:GetPort}"
Name: "{group}\BuyBox gunlukleri"; Filename: "{#DataDir}\logs"
Name: "{autodesktop}\BuyBox";     Filename: "http://127.0.0.1:{code:GetPort}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Masaustunde kisayol olustur"; GroupDescription: "Kisayollar:"
Name: "defenderexclusion"; Description: "Windows Defender'i veri klasorunu taramaktan muaf tut (onerilir)"; GroupDescription: "Basarim:"

[Run]
; Order matters and each step is checked: a failure here fails the installation (doc 14 §5).
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\configure-env.ps1"" -DataDir ""{#DataDir}"" -InstallDir ""{app}"""; \
  StatusMsg: "Yapilandirma yaziliyor..."; Flags: runhidden waituntilterminated

Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Add-MpPreference -ExclusionPath '{#DataDir}'"""; \
  StatusMsg: "Defender istisnasi ekleniyor..."; Flags: runhidden waituntilterminated skipifsilent; \
  Tasks: defenderexclusion

Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\install-service.ps1"" -InstallDir ""{app}"" -DataDir ""{#DataDir}"" -Port {code:GetPort} -Version ""{#AppVersion}"""; \
  StatusMsg: "Servis kuruluyor..."; Flags: runhidden waituntilterminated

Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\verify-health.ps1"" -Port {code:GetPort} -DataDir ""{#DataDir}"""; \
  StatusMsg: "Servis dogrulaniyor..."; Flags: runhidden waituntilterminated

Filename: "http://127.0.0.1:{code:GetPort}"; \
  Description: "BuyBox'i simdi ac"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-service.ps1"" -InstallDir ""{app}"" -DataDir ""{#DataDir}"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveBuyBoxService"

[Code]
var
  PortPage: TInputQueryWizardPage;

function RunPowerShell(const ScriptPath, Args: string; var Output: string): Integer;
var
  TempFile: string;
  ResultCode: Integer;
  Lines: TArrayOfString;
  I: Integer;
begin
  TempFile := ExpandConstant('{tmp}\buybox-script-output.txt');
  Exec('powershell.exe',
       '-NoProfile -ExecutionPolicy Bypass -Command "& { & ''' + ScriptPath + ''' ' + Args +
       ' } 2>&1 | Out-File -FilePath ''' + TempFile + ''' -Encoding utf8"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Output := '';
  if LoadStringsFromFile(TempFile, Lines) then
    for I := 0 to GetArrayLength(Lines) - 1 do
      Output := Output + Lines[I] + #13#10;
  Result := ResultCode;
end;

{ Doc 14 §5 step 1. Extracted to a temporary copy because the packaged scripts are not on disk
  yet at this point in the install. }
function InitializeSetup(): Boolean;
var
  ScriptPath, Output: string;
begin
  ScriptPath := ExpandConstant('{tmp}\preflight.ps1');
  ExtractTemporaryFile('preflight.ps1');
  if RunPowerShell(ScriptPath, '', Output) <> 0 then
  begin
    MsgBox(Output, mbCriticalError, MB_OK);
    Result := False;
    exit;
  end;
  Result := True;
end;

{ Doc 14 §5 step 3. Runs after the wizard and before the first file is replaced. On an upgrade
  the previous version is still running out of the install directory, holding node.exe, the
  WinSW executable and the Chromium payload open, and Windows will not let the wizard overwrite
  a file that is in use; install-service.ps1 starts the service again at the end. A non-empty
  result aborts the install and is shown to the operator, so the script's own Turkish output is
  the message.

  Note for anyone editing this comment: Pascal braces do not nest, so an Inno constant written
  out in full would end it early and turn the rest into code. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ScriptPath, Output: string;
begin
  Result := '';
  ScriptPath := ExpandConstant('{tmp}\stop-service.ps1');
  ExtractTemporaryFile('stop-service.ps1');
  { Single quotes around the path, not double: RunPowerShell already wraps the whole command in
    double quotes, and a second pair inside would end it early. }
  if RunPowerShell(ScriptPath, '-InstallDir ''' + ExpandConstant('{app}') + '''', Output) <> 0 then
    Result := Output;
end;

{ Doc 14 §5 step 2: a machine with something already on 3000 is common and is not an error. }
function IsPortFree(Port: Integer): Boolean;
var
  ResultCode: Integer;
begin
  Exec('powershell.exe',
       '-NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort ' +
       IntToStr(Port) + ' -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := (ResultCode = 0);
end;

procedure InitializeWizard();
begin
  PortPage := CreateInputQueryPage(wpSelectTasks,
    'Baglanti noktasi',
    'BuyBox hangi baglanti noktasinda calissin?',
    'Uygulamaya bu bilgisayardan http://127.0.0.1:<baglanti noktasi> adresiyle erisilir. ' +
    'Varsayilan degeri baska bir program kullaniyorsa degistirin.');
  PortPage.Add('Baglanti noktasi:', False);
  PortPage.Values[0] := '3000';
end;

function GetPort(Param: string): string;
begin
  if Assigned(PortPage) and (Trim(PortPage.Values[0]) <> '') then
    Result := Trim(PortPage.Values[0])
  else
    Result := '3000';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if Assigned(PortPage) and (CurPageID = PortPage.ID) then
  begin
    Port := StrToIntDef(Trim(PortPage.Values[0]), -1);
    if (Port < 1024) or (Port > 65535) then
    begin
      MsgBox('Baglanti noktasi 1024 ile 65535 arasinda bir sayi olmali.', mbError, MB_OK);
      Result := False;
      exit;
    end;
    if not IsPortFree(Port) then
    begin
      MsgBox('Bu baglanti noktasi baska bir program tarafindan kullaniliyor. Baska bir deger girin.',
             mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ Doc 14 §10 D-6: data is kept unless the operator says otherwise, and the default answer is No. }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataPath: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataPath := ExpandConstant('{#DataDir}');
    if DirExists(DataPath) then
      if MsgBox('Verileriniz, ayarlariniz ve lisansiniz ' + DataPath + ' klasorunde duruyor.' + #13#10 +
                'Bunlari da silmek istiyor musunuz? Bu islem geri alinamaz.',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataPath, True, True, True);
  end;
end;

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\chromium"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\service"
