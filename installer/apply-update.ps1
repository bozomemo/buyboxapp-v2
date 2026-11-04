<#
  Installs a downloaded release (docs/superpowers/specs/2026-11-04-auto-update-design.md section 6).

  Started only by the BuyBoxUpdater scheduled task (register-updater-task.ps1), which the app
  triggers when an admin presses "Simdi kur". It runs as SYSTEM from a COPY under
  ProgramData\BuyBox\updates, never from {app}\scripts, because it replaces {app}\scripts.

  Order matters, and is the whole design:
    1. While the old version still serves: re-verify (with the INSTALLED verifier), extract.
    2. Hold pricing, stop, back up the database.         <- failure here: abort, old version back
    3. Swap directories, start, wait for healthy.        <- failure here: roll back code (+ DB)
    4. Healthy: lift the hold.
  A rollback that itself fails leaves the hold in place: pricing stays stopped, which is the safe
  direction for a system that submits prices, and the full installer is the recovery (doc 14 s5).

  ASCII only (doc 14 section 8.4): Windows PowerShell 5.1 mis-reads anything else.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [Parameter(Mandatory)] [string] $DataDir,
  [int] $HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'

$updates   = Join-Path $DataDir 'updates'
$lockPath  = Join-Path $updates 'lock'
$request   = Join-Path $updates 'request.json'
$statusPath = Join-Path $updates 'status.json'
$holdPath  = Join-Path $updates 'hold'
$logsDir   = Join-Path $updates 'logs'
$backupsDir = Join-Path $DataDir 'backups'
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

# --- status.json (read by Settings > Guncelleme) ---------------------------------------------------
$script:status = Read-JsonFile $statusPath
$script:history = New-Object System.Collections.ArrayList
if ($script:status -and $script:status.history) { foreach ($h in $script:status.history) { [void]$script:history.Add($h) } }

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

# --- Single instance -------------------------------------------------------------------------------
$lockStream = $null
try {
  $lockStream = [IO.File]::Open($lockPath, 'CreateNew', 'Write', 'None')
} catch {
  $age = (Get-Date) - (Get-Item $lockPath -ErrorAction SilentlyContinue).LastWriteTime
  if ($age.TotalMinutes -lt 30) {
    Log "Baska bir guncelleme calisiyor (kilit $([int]$age.TotalMinutes) dk once alindi); cikiliyor."
    exit 0
  }
  Log 'Kilit 30 dakikadan eski; onceki calisma yarim kalmis sayilip devralindi.'
  Remove-Item $lockPath -Force
  $lockStream = [IO.File]::Open($lockPath, 'CreateNew', 'Write', 'None')
}

$script:from = '?'
$script:to = '?'

try {
  $req = Read-JsonFile $request
  if (-not $req -or -not $req.version) { Log 'request.json yok ya da okunamadi; yapilacak bir sey yok.'; return }
  $script:to = [string]$req.version
  $installed = Read-JsonFile (Join-Path $InstallDir 'installed.json')
  if ($installed) { $script:from = [string]$installed.version }
  $versionDir = Join-Path $updates $script:to
  Log "Guncelleme $($script:from) -> $($script:to), isteyen: $($req.requestedBy)"

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
    $candidates += (Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\$Name.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object { $_.FullName })
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

  $swapped = New-Object System.Collections.ArrayList
  $stopped = $false
  $held = $false

  try {
    # --- 1. Verify and extract while the old version still serves ----------------------------------
    Set-Status 'running' 'verify'
    Get-ChildItem $InstallDir -Directory | Where-Object { $_.Name -like '*.new' -or $_.Name -like '*.failed' } | ForEach-Object {
      Log "Onceki calismadan kalan klasor siliniyor: $($_.Name)"
      Remove-Item $_.FullName -Recurse -Force
    }

    $verifyOut = (Exec { & (Join-Path $InstallDir 'node\node.exe') (Join-Path $InstallDir 'app\verify-update.mjs') $versionDir }) | Select-Object -Last 1
    $verified = $verifyOut | ConvertFrom-Json
    if (-not $verified.ok) { throw "Dogrulama basarisiz: $($verified.reason)" }
    if ($verified.version -ne $script:to) { throw "Indirilen surum $($verified.version), istenen $($script:to)." }
    $zips = @($verified.zips)
    Log "Dogrulandi: $($zips -join ', ')"

    $needed = 0
    foreach ($name in $zips) { $needed += (Get-Item (Join-Path $versionDir "$name.zip")).Length * 3 }
    $free = (New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($InstallDir))).AvailableFreeSpace
    if ($free -lt $needed) { throw "Yetersiz disk alani: $([int]($free / 1MB)) MB bos, $([int]($needed / 1MB)) MB gerekli." }

    Set-Status 'running' 'extract'
    $extractRoot = Join-Path $versionDir 'extract'
    if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
    $newDirs = @()
    foreach ($name in $zips) {
      $target = Join-Path $extractRoot $name
      New-Item -ItemType Directory -Path $target -Force | Out-Null
      Exec { & tar.exe -x -f (Join-Path $versionDir "$name.zip") -C $target } | Out-Null
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
    Invoke-StopService
    $stopped = $true
    Backup-Database
  } catch {
    $reason = $_.Exception.Message
    Log "IPTAL: $reason"
    Get-ChildItem $InstallDir -Directory -Filter '*.new' | Remove-Item -Recurse -Force
    if ($stopped) { Invoke-StartService -Version $script:from }
    if ($held) { Remove-Item $holdPath -Force -ErrorAction SilentlyContinue }
    Add-History 'aborted' $reason
    Set-Status 'aborted' $null
    Write-Event 'Warning' "BuyBox guncellemesi $($script:from) -> $($script:to) iptal edildi: $reason"
    return
  }

  try {
    # --- 3. Swap, start, wait for healthy ------------------------------------------------------------
    Set-Status 'running' 'swap'
    foreach ($name in $newDirs) {
      $current = Join-Path $InstallDir $name
      $previous = "$current.previous"
      if (Test-Path $previous) { Remove-Item $previous -Recurse -Force }
      if (Test-Path $current) { Rename-Item $current "$name.previous" }
      Rename-Item "$current.new" $name
      [void]$swapped.Add($name)
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

    # --- 4. Healthy -----------------------------------------------------------------------------------
    Remove-Item $holdPath -Force
    $manifest = Get-Content (Join-Path $versionDir 'update.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $components = [ordered]@{}
    if ($installed -and $installed.components) {
      foreach ($p in $installed.components.PSObject.Properties) { $components[$p.Name] = [ordered]@{ version = $p.Value.version; sha256 = $p.Value.sha256 } }
    }
    foreach ($name in $zips) {
      $c = $manifest.components.$name
      $components[$name] = [ordered]@{ version = $c.version; sha256 = $c.sha256 }
    }
    Write-JsonFile (Join-Path $InstallDir 'installed.json') ([ordered]@{ version = $script:to; components = $components })

    if ($zips -contains 'monitoring') {
      try {
        & (Join-Path $InstallDir 'scripts\install-monitoring.ps1') -InstallDir $InstallDir -DataDir $DataDir -Port $Port | ForEach-Object { Log $_ }
      } catch {
        Log "Uyari: izleme ajani guncellenemedi: $($_.Exception.Message)"
      }
    }
    Remove-Item $versionDir -Recurse -Force -ErrorAction SilentlyContinue
    Add-History 'succeeded' $null
    Set-Status 'succeeded' $null
    Log "Guncelleme tamamlandi: $($script:to)"
    Write-Event 'Information' "BuyBox $($script:to) surumune guncellendi."
  } catch {
    $reason = $_.Exception.Message
    Log "GERI DONUS: $reason"
    Set-Status 'running' 'rollback'
    $errLog = Join-Path $DataDir 'logs\BuyBoxApp.err.log'
    if (Test-Path $errLog) { Get-Content $errLog -Tail 200 | ForEach-Object { Add-Content -Path $script:logFile -Value "  | $_" -Encoding utf8 } }
    try {
      Invoke-StopService
      foreach ($name in $swapped) {
        $current = Join-Path $InstallDir $name
        if (Test-Path "$current.failed") { Remove-Item "$current.failed" -Recurse -Force }
        if (Test-Path $current) { Rename-Item $current "$name.failed" }
        if (Test-Path "$current.previous") { Rename-Item "$current.previous" $name }
      }
      # Restore when the new version ran migrations -- or when it never answered at all, because
      # then nobody knows whether it did. The hold kept every job from running, so no
      # marketplace-confirmed price change happened in between that a restore could lose.
      if ($null -eq $script:maxAppliedSeen -or $null -eq $appliedBefore -or $script:maxAppliedSeen -gt $appliedBefore) {
        Restore-Database
      }
      Invoke-StartService -Version $script:from
      if (-not (Wait-Healthy $script:from)) { throw "Eski surum de saglikli acilmadi. Son yanit: $($script:lastHealth)" }
      Remove-Item $holdPath -Force
      Add-History 'rolled-back' $reason
      Set-Status 'rolled-back' $null
      Write-Event 'Warning' "BuyBox $($script:to) saglikli acilmadi; $($script:from) surumune geri donuldu: $reason"
    } catch {
      $second = $_.Exception.Message
      Log "GERI DONUS BASARISIZ: $second"
      # The hold stays: pricing remains stopped until a person looks.
      Add-History 'manual-intervention-required' "$reason / $second"
      Set-Status 'manual-intervention-required' $null
      Write-Event 'Error' "BuyBox guncellemesi geri alinamadi; fiyat islemleri durduruldu. Tam kurulum paketini calistirin. $reason / $second"
    }
  }
} finally {
  Remove-Item $request -Force -ErrorAction SilentlyContinue
  if ($lockStream) { $lockStream.Dispose() }
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
