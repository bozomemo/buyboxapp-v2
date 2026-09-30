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
; Doc 16: the Alloy installer and its config template. `skipifsourcedoesntexist` because a build
; made without the vendored Alloy binary is a valid package -- it installs a working product with
; no remote monitoring, and install-monitoring.ps1 says so and carries on.
Source: "staging\monitoring\*"; DestDir: "{app}\monitoring"; Flags: recursesubdirs createallsubdirs ignoreversion skipifsourcedoesntexist
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
Type: filesandordirs; Name: "{app}\monitoring"

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
; The four installation steps that used to live here now run from CurStepChanged below, because
; Inno ignores a [Run] entry's exit code -- see the comment there. All that is left is the
; browser, and it is skipped when one of those steps failed: sending the operator to a page that
; cannot load is not a finish.
Filename: "http://127.0.0.1:{code:GetPort}"; \
  Description: "BuyBox'i simdi ac"; Flags: postinstall shellexec nowait skipifsilent; \
  Check: ShouldLaunchApp

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-service.ps1"" -InstallDir ""{app}"" -DataDir ""{#DataDir}"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveBuyBoxService"

[Code]
var
  PortPage: TInputQueryWizardPage;
  { Doc 16 section 5. Every field is optional: leaving them blank installs a working product with
    no remote monitoring, and on an upgrade blank means "keep whatever is already configured"
    (install-monitoring.ps1 merges rather than overwrites). That is why nothing here is validated
    the way the port is -- there is no wrong answer, including no answer. }
  { Split across two pages of three fields. Six fields plus this page's description overflow a
    TInputQueryWizardPage, which lays its rows out at fixed spacing and does not scroll: the
    sixth control is created off the bottom of the frame and simply cannot be reached. That is
    the worst possible field to lose, because the token is what makes monitoring work at all,
    and losing it is silent -- install-monitoring.ps1 reads "no token" as "not configured" and
    skips, so the install still succeeds and nothing ships. Found on the 0.1.10 build. }
  MonitorPageA: TInputQueryWizardPage;
  MonitorPageB: TInputQueryWizardPage;
  { Set by CurStepChanged when a step of doc 14 section 5 failed. Read by ShouldLaunchApp. }
  InstallFailed: Boolean;
  { Doc 18 section 8.1: the setup token the service writes on its first boot while the install has
    no administrator. Read after the health check, shown on the finish page, never logged. Empty
    on an upgrade of an install that already has one. }
  SetupToken: string;

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

{ The directory a previous version installed itself into, or '' on a fresh machine. Read from
  Inno's own uninstall key rather than from the app directory constant: this runs while the
  wizard is being built, before the directory page would have set that constant, and on an
  upgrade the value we want is precisely the one the previous install recorded.

  As the PrepareToInstall comment above says, Pascal braces do not nest -- an Inno constant
  written out in full here would end this comment early. }
function PreviousInstallDir(): String;
var
  Key, Dir: string;
begin
  Result := '';
  { The AppId above, spelled out: SetupSetting would hand back the doubled leading brace the
    setup section needs to escape it, which is not what the registry key is called. Keep the
    two in step if the AppId ever changes. (A line here may not *begin* with a bracketed word:
    the script is split into sections before the code is parsed, so it would be read as a
    section tag even inside this comment.) }
  Key := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' +
         '{8C4F1E62-3D7A-4B21-9E55-0A6B7C2D9F31}_is1';
  if RegQueryStringValue(HKLM, Key, 'InstallLocation', Dir) or
     RegQueryStringValue(HKLM, Key, 'Inno Setup: App Path', Dir) then
    Result := RemoveBackslashUnlessRoot(Dir);
end;

{ The port the installed service is actually listening on, taken from the WinSW definition the
  previous install rendered (install-service.ps1 writes PORT into it). Returns '' if there is no
  previous install, or its config cannot be read. Parsed by hand because the Pascal here has no
  regular expressions -- the line is written by us and always reads:
    <env name="PORT" value="3000" /> }
function InstalledPort(): String;
var
  ConfigPath, Line, Marker: string;
  Lines: TArrayOfString;
  I, P, Q: Integer;
begin
  Result := '';
  if PreviousInstallDir() = '' then exit;
  ConfigPath := PreviousInstallDir() + '\service\BuyBoxApp.xml';
  if not FileExists(ConfigPath) then exit;
  if not LoadStringsFromFile(ConfigPath, Lines) then exit;

  Marker := 'name="PORT" value="';
  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    Line := Lines[I];
    P := Pos(Marker, Line);
    if P > 0 then
    begin
      Line := Copy(Line, P + Length(Marker), Length(Line));
      Q := Pos('"', Line);
      if Q > 1 then
        Result := Copy(Line, 1, Q - 1);
      exit;
    end;
  end;
end;

{ Doc 14 §5 step 2: a machine with something already on 3000 is common and is not an error.

  On an upgrade the thing holding the port is our own service, which is still running because
  the wizard has not reached PrepareToInstall yet -- stop-service.ps1 runs after this page, not
  before it. Treating that as a conflict would make it impossible to upgrade onto the port the
  product is already using, so a listener whose executable lives under the previous installation
  counts as free. Anything else still blocks. }
function IsPortFree(Port: Integer): Boolean;
var
  ResultCode: Integer;
  PrevDir, Command: string;
begin
  PrevDir := PreviousInstallDir();
  Command :=
    '-NoProfile -ExecutionPolicy Bypass -Command "' +
    '$ours = ''' + PrevDir + '''; ' +
    '$listeners = @(Get-NetTCPConnection -LocalPort ' + IntToStr(Port) +
      ' -State Listen -ErrorAction SilentlyContinue); ' +
    'if ($listeners.Count -eq 0) { exit 0 }; ' +
    'if ($ours) { foreach ($l in $listeners) { ' +
      '$p = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue; ' +
      'if ($p -and $p.Path -and $p.Path.StartsWith($ours, [StringComparison]::OrdinalIgnoreCase)) { exit 0 } } }; ' +
    'exit 1"';
  Exec('powershell.exe', Command, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := (ResultCode = 0);
end;

procedure InitializeWizard();
var
  Port: string;
begin
  PortPage := CreateInputQueryPage(wpSelectTasks,
    'Baglanti noktasi',
    'BuyBox hangi baglanti noktasinda calissin?',
    'Uygulamaya bu bilgisayardan http://127.0.0.1:<baglanti noktasi> adresiyle erisilir. ' +
    'Varsayilan degeri baska bir program kullaniyorsa degistirin.');
  PortPage.Add('Baglanti noktasi:', False);
  { On an upgrade, offer the port the installation already uses -- not 3000. Defaulting back to
    3000 would silently move a customer who chose 3500 at first install, taking the service and
    both shortcuts with it. }
  Port := InstalledPort();
  if Port = '' then
    Port := '3000';
  PortPage.Values[0] := Port;

  { Doc 16. Placed after the port page so the operator has already dealt with the decision that
    can block the install before meeting one that cannot. }
  MonitorPageA := CreateInputQueryPage(PortPage.ID,
    'Uzaktan izleme 1/2 (istege bagli)',
    'Kayitlari ve grafikleri bu bilgisayara baglanmadan gormek ister misiniz?',
    'Grafana Cloud hesabinizdaki degerleri girin. Bos birakirsaniz BuyBox normal kurulur, ' +
    'yalnizca uzaktan izleme etkin olmaz. Yukseltmede bos birakmak mevcut ayarlari korur.');
  MonitorPageA.Add('Makine adi (orn. ofis-pc):', False);
  MonitorPageA.Add('Loki URL (.../loki/api/v1/push):', False);
  MonitorPageA.Add('Loki kullanici no:', False);

  MonitorPageB := CreateInputQueryPage(MonitorPageA.ID,
    'Uzaktan izleme 2/2 (istege bagli)',
    'Metrik adresi ve erisim jetonu.',
    'Prometheus kullanici numarasi Loki''ninkinden farklidir; ayni numarayi iki yere yazmak ' +
    'yarisini sessizce calismaz hale getirir.');
  MonitorPageB.Add('Prometheus URL (.../api/prom/push):', False);
  MonitorPageB.Add('Prometheus kullanici no:', False);
  { The one masked field. It is also the only one never written to disk in the clear:
    install-monitoring.ps1 puts it in its own file, readable by SYSTEM and Administrators only. }
  MonitorPageB.Add('Erisim jetonu (token):', True);
end;

{ Quotes a wizard value for the PowerShell command line RunPowerShell builds. Single quotes,
  because that helper already wraps the whole command in double quotes -- and an embedded single
  quote is doubled, the PowerShell escape, so a stray apostrophe in a value cannot end the string
  early and turn the rest of it into commands. None of these fields should ever contain one; that
  is exactly why it is worth handling rather than assuming. }
function PSQuote(const Value: string): string;
var
  I: Integer;
  Ch, Escaped: string;
begin
  Escaped := '';
  for I := 1 to Length(Value) do
  begin
    Ch := Copy(Value, I, 1);
    if Ch = '''' then
      Escaped := Escaped + ''''''
    else
      Escaped := Escaped + Ch;
  end;
  Result := '''' + Escaped + '''';
end;

{ Indices stay 0..5 across the two pages so the CurStepChanged call site reads as one list of
  fields; 0-2 live on page A, 3-5 on page B. }
function MonitorValue(Index: Integer): string;
begin
  Result := '';
  if Index < 3 then
  begin
    if Assigned(MonitorPageA) then
      Result := Trim(MonitorPageA.Values[Index]);
  end
  else
  begin
    if Assigned(MonitorPageB) then
      Result := Trim(MonitorPageB.Values[Index - 3]);
  end;
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

procedure Status(const Message: string);
begin
  Log(Message);
  if Assigned(WizardForm) then
    WizardForm.StatusLabel.Caption := Message;
end;

{ Runs one of the packaged scripts and reports whether it succeeded. On a failure the script's
  own Turkish output is what the operator is shown -- every one of them is written to name what
  went wrong and where to look next, so there is nothing to add to it here. }
function RunStep(const ScriptName, Args, FailureMessage: string): Boolean;
var
  Output: string;
begin
  Result := RunPowerShell(ExpandConstant('{app}\scripts\') + ScriptName, Args, Output) = 0;
  if Result then
    exit;

  InstallFailed := True;
  Log('BuyBox kurulum adimi basarisiz: ' + ScriptName);
  Log(Output);
  if not WizardSilent then
    MsgBox(FailureMessage + #13#10#13#10 + Output, mbCriticalError, MB_OK);
end;

{ Doc 14 section 5 steps 4, 6, 7 and 8.

  These ran from the Run section until 2026-09-02, which was a mistake: Inno ignores a Run
  entry's exit code entirely, so any of them could fail and the wizard would still finish with
  "Kurulum tamamlandi". That is what happened on a customer machine on 2026-09-01 --
  install-service.ps1 aborted on WinSW's "Unknown command: refresh" before it could start the
  service, verify-health.ps1 then failed against the stopped service, and neither was reported to
  anyone. Doc 14 section 5 step 8 requires the opposite: an installer that reports success over a
  broken service is worse than one that fails.

  Run from here each step's exit code is checked, a failure stops the remaining steps, is written
  to the setup log, is shown to the operator, and suppresses the "open BuyBox" button. The files
  are left in place rather than rolled back -- on an upgrade a rollback would take the working
  previous installation with it, and the operator's data directory is untouched either way, so
  re-running the installer is the recovery. }
procedure CurStepChanged(CurStep: TSetupStep);
var
  RawToken: AnsiString;
  AppDirArg, DataDirArg: string;
  DefenderCode, MonitorCode: Integer;
  MonitorOutput: string;
begin
  if CurStep <> ssPostInstall then
    exit;

  AppDirArg := '''' + ExpandConstant('{app}') + '''';
  DataDirArg := '''' + ExpandConstant('{#DataDir}') + '''';

  Status('Yapilandirma yaziliyor...');
  if not RunStep('configure-env.ps1',
                 '-DataDir ' + DataDirArg + ' -InstallDir ' + AppDirArg,
                 'Yapilandirma yazilamadi; kurulum tamamlanamadi.') then
    exit;

  { Best effort, and deliberately not checked: doc 14 section 5 step 6 makes this a throughput
    optimisation, and a machine whose Defender is disabled or managed by policy is not a broken
    installation. }
  if WizardIsTaskSelected('defenderexclusion') and not WizardSilent then
  begin
    Status('Defender istisnasi ekleniyor...');
    Exec('powershell.exe',
         '-NoProfile -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionPath ' +
           DataDirArg + '"',
         '', SW_HIDE, ewWaitUntilTerminated, DefenderCode);
  end;

  Status('Servis kuruluyor...');
  if not RunStep('install-service.ps1',
                 '-InstallDir ' + AppDirArg + ' -DataDir ' + DataDirArg +
                   ' -Port ' + GetPort('') + ' -Version ''{#AppVersion}''',
                 'BuyBox servisi kurulamadi; kurulum tamamlanamadi.') then
    exit;

  Status('Servis dogrulaniyor...');
  if not RunStep('verify-health.ps1',
                 '-Port ' + GetPort('') + ' -DataDir ' + DataDirArg,
                 'BuyBox servisi calisir duruma gelmedi; kurulum tamamlanamadi.') then
    exit;

  { The service is up, so its first boot has run, and a token exists if the install has no
    administrator yet. Not Log()ged: the setup log is a file anyone reading the install can see. }
  if LoadStringFromFile(ExpandConstant('{#DataDir}') + '\bootstrap-token.txt', RawToken) then
    SetupToken := Trim(String(RawToken));

  { Doc 16 section 5. Deliberately LAST, and deliberately not checked with RunStep.

    Last, because it is the only step that is not required for a working product -- by the time
    it runs, BuyBox is installed, started and verified, so nothing it does can take that away.

    Unchecked, because remote monitoring is a convenience and its absence is not a broken
    install. install-monitoring.ps1 exits 0 on every path it can reach, reporting what it did in
    its own output; treating a missing Grafana account, or no internet during setup, as an
    installation failure would be the tail wagging the dog. This is the one place where the
    2026-09-02 lesson -- that Inno ignoring an exit code hid a real failure -- does not apply,
    because here there is no failure to hide. }
  { RunPowerShell, not a bare Exec with -File. Under -File the Windows command line is split
    before PowerShell sees it, and that split honours double quotes only -- so -InstallDir
    'C:\Program Files\BuyBox' binds the parameter to 'C:\Program and leaves Files\BuyBox' as a
    stray positional argument. The result is a binding failure that exits 1 in a third of a
    second, before the script's first statement, which looks exactly like a script that ran and
    declined to do anything. RunPowerShell instead passes the whole invocation as a -Command
    string, which PowerShell parses itself, and it is what every other step here already uses.
    Note for anyone editing this comment: a brace closes it, so the -Command form cannot be
    spelled out literally here -- see RunPowerShell for it.
    Measured on the 0.1.10 install, 2026-09-08.

    RunPowerShell rather than RunStep, though: RunStep sets InstallFailed and shows a critical
    error box, and monitoring must never fail the installation (see the note above). The exit
    code and the script's own output go to the log and nowhere else. }
  Status('Uzaktan izleme kuruluyor...');
  MonitorCode := RunPowerShell(ExpandConstant('{app}\scripts\install-monitoring.ps1'),
                               '-InstallDir ' + AppDirArg + ' -DataDir ' + DataDirArg +
                                 ' -Port ' + GetPort('') +
                                 ' -Instance ' + PSQuote(MonitorValue(0)) +
                                 ' -LokiUrl '  + PSQuote(MonitorValue(1)) +
                                 ' -LokiUser ' + PSQuote(MonitorValue(2)) +
                                 ' -PromUrl '  + PSQuote(MonitorValue(3)) +
                                 ' -PromUser ' + PSQuote(MonitorValue(4)) +
                                 ' -Token '    + PSQuote(MonitorValue(5)),
                               MonitorOutput);
  Log('Uzaktan izleme adimi cikis kodu: ' + IntToStr(MonitorCode));
  Log(MonitorOutput);
end;

function ShouldLaunchApp(): Boolean;
begin
  Result := not InstallFailed;
end;

{ Doc 18 section 8.1, doc 14 section 10 D-1: the finish page shows the setup token, because the
  first thing the browser asks for is exactly this, and the operator is looking at this page. }
procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and (SetupToken <> '') and not InstallFailed then
    WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 +
      { No continuation line may start with '#': ISPP reads it as a preprocessor directive. }
      'BuyBox ilk acildiginda yonetici hesabi olusturmak icin su kurulum anahtarini isteyecek:' + #13#10#13#10 +
      SetupToken + #13#10#13#10 +
      'Anahtar ayrica su dosyada: ' + ExpandConstant('{#DataDir}') + '\bootstrap-token.txt';
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
Type: filesandordirs; Name: "{app}\monitoring"
