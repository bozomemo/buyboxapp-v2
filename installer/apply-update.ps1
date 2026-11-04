<#
  Installs a downloaded release (docs/superpowers/specs/2026-11-04-auto-update-design.md section 6).

  Started only by the BuyBoxUpdater scheduled task (register-updater-task.ps1), which the app
  triggers when an admin presses "Simdi kur". It runs as SYSTEM from a copy in {app}\.updater,
  never from {app}\scripts, because it replaces {app}\scripts.

  Order matters, and is the whole design:
    1. While the old version still serves: copy the download into {app}\.update-staging,
       re-verify it there with the INSTALLED verifier, and extract it there.
    2. Hold pricing, stop, back up the database.         <- failure here: abort, old version back
    3. Swap directories, start, wait for healthy.        <- failure here: roll back code (+ DB)
    4. Healthy: record the new version, then lift the hold.
  A rollback that itself fails leaves the hold in place: pricing stays stopped, which is the safe
  direction for a system that submits prices, and the full installer is the recovery (doc 14 s5).

  Nothing is verified or extracted in ProgramData (review C1, 2026-11-05): every local user can
  create files there, so an archive could be swapped between its check and its use, and a folder
  moved out of it would carry a user-writable ACL into Program Files. Staging under {app} closes
  both, and keeps the final rename on one volume when {app} is not on ProgramData's drive.

  Every way out of this script writes status.json, a history entry and an Event Log entry.

  ASCII only (doc 14 section 8.4): Windows PowerShell 5.1 mis-reads anything else.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [Parameter(Mandatory)] [string] $DataDir,
  [int] $HealthTimeoutSeconds = 180,
  # Tests only (installer\test\apply-update-harness.ps1): skips the ACL and Event Log steps that
  # need SYSTEM. Never passed by the scheduled task.
  [switch] $NoPrivilegedSteps
)

$ErrorActionPreference = 'Stop'

$updates    = Join-Path $DataDir 'updates'
$lockPath   = Join-Path $updates 'lock'
$request    = Join-Path $updates 'request.json'
$statusPath = Join-Path $updates 'status.json'
$holdPath   = Join-Path $updates 'hold'
$logsDir    = Join-Path $updates 'logs'
$backupsDir = Join-Path $DataDir 'backups'
$staging    = Join-Path $InstallDir '.update-staging'
# Same figure as UPDATE_STALE_MS in packages/jobs: after this a lock belongs to a run that died.
$staleMinutes = 45

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
New-Item -ItemType Directory -Path $backupsDir -Force | Out-Null
$script:logFile = Join-Path $logsDir ("apply-{0}.log" -f (Get-Date -Format 'yyyyMMddHHmmss'))

function Log {
  param([string] $Message)
  $line = '[{0}] {1}' -f (Get-Date -Format 's'), $Message
  Write-Output $line
  Add-Content -Path $script:logFile -Value $line -Encoding utf8
}

function Write-Event {
  param([string] $Type, [string] $Message)
  if ($NoPrivilegedSteps) { return }
  try {
    if (-not [Diagnostics.EventLog]::SourceExists('BuyBoxUpdater')) {
      New-EventLog -LogName Application -Source 'BuyBoxUpdater'
    }
    Write-EventLog -LogName Application -Source 'BuyBoxUpdater' -EntryType $Type -EventId 1 -Message $Message
  } catch {
    Log "Event Log yazilamadi: $($_.Exception.Message)"
  }
}

# Windows PowerShell 5.1 turns a native program's stderr into a terminating error under Stop when
# output is captured; judge native commands by their exit code instead (see release.ps1).
function Exec {
  param([Parameter(Mandatory)] [scriptblock] $Command)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Command 2>&1 | ForEach-Object { "$_" }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Write-JsonFile {
  param([string] $Path, $Value)
  $temporary = "$Path.tmp-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $Value -Depth 6), (New-Object Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Read-JsonFile {
  param([string] $Path)
  if (-not (Test-Path $Path)) { return $null }
  try { return (Get-Content $Path -Raw -Encoding utf8) | ConvertFrom-Json } catch { return $null }
}

# Same lock-down as register-updater-task.ps1, re-asserted on every run: the task may have been
# registered by an older installer, and anything a user planted since is reset and re-owned.
function Protect-AdminOnly {
  param([string] $Path)
  if ($NoPrivilegedSteps) { return }
  & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls could not protect $Path (exit $LASTEXITCODE)." }
  & icacls.exe $Path /setowner '*S-1-5-32-544' /T /C /Q | Out-Null
  if (Get-ChildItem $Path -Force) { & icacls.exe (Join-Path $Path '*') /reset /T /C /Q | Out-Null }
}

# --- status.json (read by Settings > Guncelleme) ---------------------------------------------------
$script:status = Read-JsonFile $statusPath
$script:history = New-Object System.Collections.ArrayList
if ($script:status -and $script:status.history) { foreach ($h in $script:status.history) { [void]$script:history.Add($h) } }
$script:from = '?'
$script:to = '?'
$script:finished = $false

function Set-Status {
  # $Step untyped on purpose: a [string] parameter turns $null into "", and the UI reads null as
  # "no step in progress".
  param([string] $Phase, $Step = $null)
  Write-JsonFile $statusPath ([ordered]@{ phase = $Phase; step = $Step; history = @($script:history) })
}

function Add-History {
  param([string] $Outcome, [string] $Reason)
  [void]$script:history.Insert(0, [ordered]@{ at = (Get-Date).ToUniversalTime().ToString('o'); from = $script:from; to = $script:to; outcome = $Outcome; reason = $Reason })
  while ($script:history.Count -gt 20) { $script:history.RemoveAt($script:history.Count - 1) }
}

# The one place a run ends. Never throws: a failure to record must not hide the outcome itself.
function Complete-Run {
  param([string] $Outcome, [string] $Reason, [string] $EventType, [string] $Message)
  try { Add-History $Outcome $Reason; Set-Status $Outcome $null } catch { Log "status.json yazilamadi: $($_.Exception.Message)" }
  Log $Message
  Write-Event $EventType $Message
  $script:finished = $true
}

# --- Single instance -------------------------------------------------------------------------------
$lockStream = $null
try {
  $lockStream = [IO.File]::Open($lockPath, 'CreateNew', 'Write', 'None')
} catch {
  $age = (Get-Date) - (Get-Item $lockPath -ErrorAction SilentlyContinue).LastWriteTime
  if ($age.TotalMinutes -lt $staleMinutes) {
    Log "Baska bir guncelleme calisiyor (kilit $([int]$age.TotalMinutes) dk once alindi); cikiliyor."
    exit 0
  }
  Log "Kilit $staleMinutes dakikadan eski; onceki calisma yarim kalmis sayilip devralindi."
  Remove-Item $lockPath -Force
  $lockStream = [IO.File]::Open($lockPath, 'CreateNew', 'Write', 'None')
}

$swapped = New-Object System.Collections.ArrayList
$stopped = $false
$held = $false

try {
  Protect-AdminOnly $updates
  Protect-AdminOnly $backupsDir

  $req = Read-JsonFile $request
  if (-not $req -or -not $req.version) { Log 'request.json yok ya da okunamadi; yapilacak bir sey yok.'; $script:finished = $true; return }
  $script:to = [string]$req.version
  $installedPath = Join-Path $InstallDir 'installed.json'
  $installed = Read-JsonFile $installedPath
  if ($installed) { $script:from = [string]$installed.version }
  $versionDir = Join-Path $updates $script:to
  Log "Guncelleme $($script:from) -> $($script:to), isteyen: $($req.requestedBy)"

  # Never a downgrade, never a reinstall (review I3): the app refuses too, but this script acts on
  # files, and the files can be stale.
  $fromVersion = $null; $toVersion = $null
  if (-not [version]::TryParse($script:to, [ref]$toVersion) -or -not [version]::TryParse($script:from, [ref]$fromVersion)) {
    throw "Surum karsilastirilamadi (kurulu: $($script:from), istenen: $($script:to))."
  }
  if ($toVersion -le $fromVersion) { throw "Istenen surum $($script:to) kurulu surumden ($($script:from)) yeni degil." }

  # Port and the rest of the service's own settings come from its current definition.
  [xml]$serviceXml = Get-Content (Join-Path $InstallDir 'service\BuyBoxApp.xml') -Raw
  $Port = [int](($serviceXml.service.env | Where-Object { $_.name -eq 'PORT' }).value)
  $healthUrl = "http://127.0.0.1:$Port/api/health"

  function Get-Health {
    try { return Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5 } catch { return $null }
  }

  # Waits for the version the service should now be running. Remembers the highest migration
  # count it ever saw, which is what decides whether a rollback must restore the database.
  $script:maxAppliedSeen = $null
  function Wait-Healthy {
    param([string] $Version)
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    $script:lastHealth = '(yanit yok)'
    while ((Get-Date) -lt $deadline) {
      $h = Get-Health
      if ($h) {
        $script:lastHealth = ($h | ConvertTo-Json -Compress -Depth 6)
        $applied = $h.database.schema.applied
        if ($null -ne $applied -and ($null -eq $script:maxAppliedSeen -or [int]$applied -gt $script:maxAppliedSeen)) { $script:maxAppliedSeen = [int]$applied }
        if ($h.status -eq 'ok' -and $h.version -eq $Version -and $h.worker.running -and $h.worker.databaseTarget -eq $h.worker.configuredDatabase) { return $true }
      }
      Start-Sleep -Seconds 3
    }
    return $false
  }

  # --- Database helpers ---------------------------------------------------------------------------
  $envFile = Join-Path $DataDir '.env.local'
  $dbLine = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $dbLine) { throw 'DATABASE_URL .env.local icinde bulunamadi.' }
  $databaseUrl = ($dbLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
  if ($databaseUrl -match '^postgres(ql)?://') { $dialect = 'postgres' }
  elseif ($databaseUrl -match '^mysql://') { $dialect = 'mysql' }
  else { $dialect = 'sqlite' }

  function Find-PgTool {
    param([string] $Name)
    $candidates = @()
    if ($env:PG_BIN_DIR) { $candidates += (Join-Path $env:PG_BIN_DIR "$Name.exe") }
    $installs = Get-ChildItem 'HKLM:\SOFTWARE\PostgreSQL\Installations' -ErrorAction SilentlyContinue
    foreach ($key in $installs) {
      $base = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).'Base Directory'
      if ($base) { $candidates += (Join-Path $base "bin\$Name.exe") }
    }
    # Newest major first, numerically: a string sort ranks 9.6 above 16.
    $candidates += (Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\$Name.exe" -ErrorAction SilentlyContinue |
      Sort-Object { $v = 0.0; [void][double]::TryParse($_.Directory.Parent.Name, [ref]$v); $v } -Descending |
      ForEach-Object { $_.FullName })
    $candidates += (Get-Command "$Name.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    $found = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $found) { throw "$Name.exe bulunamadi. PostgreSQL bin klasorunu PG_BIN_DIR ortam degiskeni ile belirtin." }
    return $found
  }

  function Get-SqliteFile {
    $path = $databaseUrl -replace '^file:', ''
    if (-not [IO.Path]::IsPathRooted($path)) { $path = Join-Path $DataDir $path }
    return [IO.Path]::GetFullPath($path)
  }

  $backupBase = Join-Path $backupsDir "pre-update-$($script:from)-$($script:to)"
  $tablesFile = "$backupBase.tables.txt"

  function Get-PgTables {
    # Never logged: the URL carries the database password.
    $out = Exec { & (Find-PgTool 'psql') "--dbname=$databaseUrl" -At -c "select schemaname || '.' || tablename from pg_tables where schemaname in ('public','drizzle') order by 1" }
    if ($LASTEXITCODE -ne 0) { throw "psql tablo listesi alinamadi (cikis kodu $LASTEXITCODE)." }
    return @($out | Where-Object { $_ -match '^\w+\.\w+$' })
  }

  function Backup-Database {
    if ($dialect -eq 'postgres') {
      Get-PgTables | Set-Content -Path $tablesFile -Encoding ascii
      Exec { & (Find-PgTool 'pg_dump') "--dbname=$databaseUrl" -Fc -f "$backupBase.dump" } | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "pg_dump basarisiz (cikis kodu $LASTEXITCODE)." }
      Log "Veritabani yedegi: $backupBase.dump"
    } elseif ($dialect -eq 'sqlite') {
      $file = Get-SqliteFile
      Copy-Item $file "$backupBase.db" -Force
      if (Test-Path "$file-wal") { Copy-Item "$file-wal" "$backupBase.db-wal" -Force }
      Log "Veritabani yedegi: $backupBase.db"
    } else {
      # The spec covers PostgreSQL and SQLite. An update that cannot be undone is not started.
      throw 'MySQL veritabani icin otomatik guncelleme yedegi yok; guncelleme yapilmadi. Tam kurulum paketini kullanin.'
    }
    # Keep the newest five pre-update backups of each kind.
    foreach ($pattern in @('pre-update-*.dump', 'pre-update-*.db', 'pre-update-*.tables.txt')) {
      Get-ChildItem $backupsDir -Filter $pattern | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Force
    }
  }

  function Restore-Database {
    if ($dialect -eq 'postgres') {
      # pg_restore --clean drops only what the dump contains, so a table the new version's
      # migration created would survive and break the next update's migration. Drop those first.
      $before = @(Get-Content $tablesFile)
      foreach ($table in (Get-PgTables | Where-Object { $before -notcontains $_ })) {
        $parts = $table.Split('.')
        Log "Yeni surumun ekledigi tablo kaldiriliyor: $table"
        Exec { & (Find-PgTool 'psql') "--dbname=$databaseUrl" -v ON_ERROR_STOP=1 -c "drop table if exists `"$($parts[0])`".`"$($parts[1])`" cascade" } | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Tablo kaldirilamadi: $table" }
      }
      Exec { & (Find-PgTool 'pg_restore') --clean --if-exists --no-owner --single-transaction "--dbname=$databaseUrl" "$backupBase.dump" } | ForEach-Object { Log $_ }
      if ($LASTEXITCODE -ne 0) { throw "pg_restore basarisiz (cikis kodu $LASTEXITCODE)." }
    } else {
      $file = Get-SqliteFile
      foreach ($suffix in @('-wal', '-shm')) { Remove-Item "$file$suffix" -Force -ErrorAction SilentlyContinue }
      Copy-Item "$backupBase.db" $file -Force
      if (Test-Path "$backupBase.db-wal") { Copy-Item "$backupBase.db-wal" "$file-wal" -Force }
    }
    Log 'Veritabani guncelleme oncesi yedekten geri yuklendi.'
  }

  function Invoke-StopService {
    & (Join-Path $InstallDir 'scripts\stop-service.ps1') -InstallDir $InstallDir | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) { throw 'Servis durdurulamadi.' }
  }

  function Invoke-StartService {
    param([string] $Version)
    & (Join-Path $InstallDir 'scripts\install-service.ps1') -InstallDir $InstallDir -DataDir $DataDir -Port $Port -Version $Version | ForEach-Object { Log $_ }
  }

  # Puts every swapped component back; also repairs a swap that stopped half way (review I7):
  # `X` already renamed to `X.previous` but `X.new` never renamed to `X`.
  function Restore-Swapped {
    foreach ($name in $swapped) {
      $current = Join-Path $InstallDir $name
      if (-not (Test-Path "$current.previous")) { continue }
      if (Test-Path "$current.failed") { Remove-Item "$current.failed" -Recurse -Force }
      if (Test-Path $current) { Rename-Item $current "$name.failed" }
      Rename-Item "$current.previous" $name
    }
  }

  try {
    # --- 1. Stage, verify and extract while the old version still serves -----------------------------
    Set-Status 'running' 'verify'
    Get-ChildItem $InstallDir -Directory -Force | Where-Object { $_.Name -like '*.new' -or $_.Name -like '*.failed' } | ForEach-Object {
      Log "Onceki calismadan kalan klasor siliniyor: $($_.Name)"
      Remove-Item $_.FullName -Recurse -Force
    }
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null

    $sourceFiles = @(Get-ChildItem $versionDir -File | Where-Object { $_.Name -eq 'update.json' -or $_.Name -eq 'update.json.sig' -or $_.Name -like '*.zip' })
    $needed = 0
    foreach ($f in $sourceFiles) { $needed += $f.Length * 3 }
    $free = (New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($InstallDir))).AvailableFreeSpace
    if ($free -lt $needed) { throw "Yetersiz disk alani: $([int]($free / 1MB)) MB bos, $([int]($needed / 1MB)) MB gerekli." }
    foreach ($f in $sourceFiles) { Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $staging $f.Name) }

    # From here on only the staged copies are read: users cannot write under {app}.
    $verifyOut = (Exec { & (Join-Path $InstallDir 'node\node.exe') (Join-Path $InstallDir 'app\verify-update.mjs') $staging $installedPath }) | Select-Object -Last 1
    $verified = $verifyOut | ConvertFrom-Json
    if (-not $verified.ok) { throw "Dogrulama basarisiz: $($verified.reason)" }
    if ($verified.version -ne $script:to) { throw "Indirilen surum $($verified.version), istenen $($script:to)." }
    $zips = @($verified.zips)
    Log "Dogrulandi: $($zips -join ', ')"

    Set-Status 'running' 'extract'
    $newDirs = @()
    foreach ($name in $zips) {
      $target = Join-Path $staging "extract\$name"
      New-Item -ItemType Directory -Path $target -Force | Out-Null
      Exec { & tar.exe -x -f (Join-Path $staging "$name.zip") -C $target } | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$name arsivi acilamadi." }
      foreach ($dir in (Get-ChildItem $target -Directory)) {
        Move-Item $dir.FullName (Join-Path $InstallDir "$($dir.Name).new")
        $newDirs += $dir.Name
      }
    }

    $before = Get-Health
    $appliedBefore = $null
    if ($before -and $null -ne $before.database.schema.applied) { $appliedBefore = [int]$before.database.schema.applied }

    # --- 2. Hold, stop, back up ----------------------------------------------------------------------
    Set-Status 'running' 'backup'
    Set-Content -Path $holdPath -Value $script:to -Encoding ascii
    $held = $true
    # Set before the attempt (review I4): stop-service.ps1 can stop the service and still exit 1,
    # and an abort that thinks nothing was stopped would leave it down.
    $stopped = $true
    Invoke-StopService
    Backup-Database
  } catch {
    $reason = $_.Exception.Message
    Log "IPTAL: $reason"
    try {
      Get-ChildItem $InstallDir -Directory -Filter '*.new' | Remove-Item -Recurse -Force
      if ($stopped) { Invoke-StartService -Version $script:from }
      if ($held) { Remove-Item $holdPath -Force -ErrorAction SilentlyContinue }
      Complete-Run 'aborted' $reason 'Warning' "BuyBox guncellemesi $($script:from) -> $($script:to) iptal edildi: $reason"
    } catch {
      # Could not even put the old version back: say so, and keep pricing held.
      $second = $_.Exception.Message
      Complete-Run 'manual-intervention-required' "$reason / $second" 'Error' "BuyBox guncellemesi iptal edilirken eski surum baslatilamadi; fiyat islemleri durduruldu. $reason / $second"
    }
    return
  }

  try {
    # --- 3. Swap, start, wait for healthy ------------------------------------------------------------
    Set-Status 'running' 'swap'
    foreach ($name in $newDirs) {
      $current = Join-Path $InstallDir $name
      $previous = "$current.previous"
      if (Test-Path $previous) { Remove-Item $previous -Recurse -Force }
      # Recorded before the first rename, so a swap that stops half way is still undone (review I7).
      [void]$swapped.Add($name)
      if (Test-Path $current) { Rename-Item $current "$name.previous" }
      Rename-Item "$current.new" $name
    }
    # The rendered service definition lives inside service\ and carries the hand-added network
    # settings (doc 14 s13.7). install-service.ps1 carries them over from the file it finds there.
    if ($swapped -contains 'service') {
      $oldXml = Join-Path $InstallDir 'service.previous\BuyBoxApp.xml'
      if (Test-Path $oldXml) { Copy-Item $oldXml (Join-Path $InstallDir 'service\BuyBoxApp.xml') -Force }
    }

    Set-Status 'running' 'start'
    Invoke-StartService -Version $script:to
    Set-Status 'running' 'health'
    if (-not (Wait-Healthy $script:to)) { throw "Yeni surum $HealthTimeoutSeconds saniye icinde saglikli olmadi. Son yanit: $($script:lastHealth)" }
  } catch {
    $reason = $_.Exception.Message
    Log "GERI DONUS: $reason"
    try {
      Set-Status 'running' 'rollback'
      $errLog = Join-Path $DataDir 'logs\BuyBoxApp.err.log'
      if (Test-Path $errLog) { Get-Content $errLog -Tail 200 | ForEach-Object { Add-Content -Path $script:logFile -Value "  | $_" -Encoding utf8 } }
      Invoke-StopService
      Restore-Swapped
      # Restore when the new version ran migrations -- or when it never answered at all, because
      # then nobody knows whether it did. The hold kept every job from running, so no
      # marketplace-confirmed price change happened in between that a restore could lose.
      if ($null -eq $script:maxAppliedSeen -or $null -eq $appliedBefore -or $script:maxAppliedSeen -gt $appliedBefore) {
        Restore-Database
      }
      Invoke-StartService -Version $script:from
      if (-not (Wait-Healthy $script:from)) { throw "Eski surum de saglikli acilmadi. Son yanit: $($script:lastHealth)" }
      Remove-Item $holdPath -Force
      Complete-Run 'rolled-back' $reason 'Warning' "BuyBox $($script:to) saglikli acilmadi; $($script:from) surumune geri donuldu: $reason"
    } catch {
      $second = $_.Exception.Message
      # The hold stays: pricing remains stopped until a person looks.
      Complete-Run 'manual-intervention-required' "$reason / $second" 'Error' "BuyBox guncellemesi geri alinamadi; fiyat islemleri durduruldu. Tam kurulum paketini calistirin. $reason / $second"
    }
    return
  }

  # --- 4. Healthy: record, then lift the hold ---------------------------------------------------------
  # Nothing here may roll back a version that is running healthily (review I8). Bookkeeping comes
  # first and the hold is lifted last, so jobs resume only once the update is fully recorded.
  try {
    $manifest = Get-Content (Join-Path $staging 'update.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $components = [ordered]@{}
    if ($installed -and $installed.components) {
      foreach ($p in $installed.components.PSObject.Properties) { $components[$p.Name] = [ordered]@{ version = $p.Value.version; sha256 = $p.Value.sha256 } }
    }
    foreach ($name in $zips) {
      $c = $manifest.components.$name
      $components[$name] = [ordered]@{ version = $c.version; sha256 = $c.sha256 }
    }
    Write-JsonFile $installedPath ([ordered]@{ version = $script:to; components = $components })
  } catch {
    Log "Uyari: installed.json yazilamadi; sonraki kontrol tum bilesenleri indirebilir: $($_.Exception.Message)"
  }
  if ($zips -contains 'monitoring') {
    try {
      & (Join-Path $InstallDir 'scripts\install-monitoring.ps1') -InstallDir $InstallDir -DataDir $DataDir -Port $Port | ForEach-Object { Log $_ }
    } catch {
      Log "Uyari: izleme ajani guncellenemedi: $($_.Exception.Message)"
    }
  }
  Remove-Item $versionDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $holdPath -Force -ErrorAction SilentlyContinue
  Complete-Run 'succeeded' $null 'Information' "BuyBox $($script:to) surumune guncellendi."
} catch {
  # Anything that escaped the phases above -- an unreadable service definition, no DATABASE_URL --
  # still leaves a record (review I5). Nothing was stopped or swapped yet when this runs.
  if (-not $script:finished) {
    Complete-Run 'aborted' $_.Exception.Message 'Warning' "BuyBox guncellemesi baslatilamadi: $($_.Exception.Message)"
  }
} finally {
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue }
  Remove-Item $request -Force -ErrorAction SilentlyContinue
  if ($lockStream) { $lockStream.Dispose() }
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
