<#
  Exercises installer\apply-update.ps1 against a FAKE install: stub stop/start scripts and a small
  health server stand in for the Windows service, so the success, rollback and abort paths run
  for real without a VM or administrator rights (review recommendation, 2026-11-05).

  What it cannot cover, and the VM rehearsal (doc 14 section 10, U-1..U-7) still must: WinSW,
  PostgreSQL dump/restore, ACLs and the Event Log (-NoPrivilegedSteps skips the last two).

  Needs: a built repository (npm run build), Node on PATH, and the release signing key at
  %USERPROFILE%\.buybox\release-signing-key.pem -- the installed verifier trusts only the keys
  compiled into the build, so the fake release must be signed with the real one.

    powershell -ExecutionPolicy Bypass -File installer\test\apply-update-harness.ps1

  Exit code 0 when every scenario passed. ASCII only.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$work = Join-Path $env:TEMP "buybox-apply-harness-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$port = Get-Random -Minimum 39100 -Maximum 39900
$script:failures = 0

function Check {
  param([string] $Name, [bool] $Ok)
  if ($Ok) { Write-Output "  PASS  $Name" } else { Write-Output "  FAIL  $Name"; $script:failures++ }
}

function Write-Text([string] $Path, [string] $Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

$verifier = Join-Path $work 'verify-update.mjs'
New-Item -ItemType Directory -Path $work -Force | Out-Null
& node (Join-Path $repo 'scripts\build-verify-update.mjs') $verifier | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Bundling verify-update.mjs failed.' }

function Health([string] $Status, [string] $Version, [int] $Applied) {
  ConvertTo-Json -Compress -Depth 5 -InputObject ([ordered]@{
    status = $Status; version = $Version
    worker = [ordered]@{ running = $true; databaseTarget = 'db'; configuredDatabase = 'db' }
    database = [ordered]@{ schema = [ordered]@{ applied = $Applied } }
  })
}

# One fake install, freshly made, per scenario.
function New-FakeInstall {
  param([string] $Name, [switch] $BrokenRelease, [string] $RequestVersion = '0.2.1', [switch] $TamperZip)
  $root = Join-Path $work $Name
  $inst = Join-Path $root 'install'; $data = Join-Path $root 'data'
  foreach ($d in @("$inst\node", "$inst\app", "$inst\scripts", "$inst\service", "$data\updates\0.2.1")) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
  Copy-Item (Get-Command node).Source "$inst\node\node.exe"
  Copy-Item $verifier "$inst\app\verify-update.mjs"
  Write-Text "$inst\app\marker.txt" 'old'
  Write-Text "$inst\service\BuyBoxApp.xml" "<service><env name=`"PORT`" value=`"$port`" /></service>"
  Write-Text "$inst\installed.json" ('{"version":"0.2.0","components":{"app":{"version":"0.2.0","sha256":"' + ('f' * 64) + '"}}}')
  Write-Text "$data\.env.local" 'DATABASE_URL=file:./app.db'
  Write-Text "$data\app.db" 'before'
  Write-Text "$data\health.json" (Health 'ok' '0.2.0' 26)

  # Stub service scripts: stop marks the fake service down; start brings up whatever app\ is now
  # installed -- healthy, or (with app\broken present) migrated and degraded.
  Write-Text "$inst\scripts\stop-service.ps1" @'
param([string] $InstallDir, [int] $TimeoutSeconds = 90)
Set-Content -Path (Join-Path (Split-Path $InstallDir) 'data\health.json') -Value 'down'
exit 0
'@
  Write-Text "$inst\scripts\install-service.ps1" @'
param([string] $InstallDir, [string] $DataDir, [int] $Port, [string] $Version)
$applied = 26
$status = 'ok'
if (Test-Path (Join-Path $InstallDir 'app\broken')) {
  $applied = 27
  $status = 'degraded'
  Set-Content -Path (Join-Path $DataDir 'app.db') -Value 'migrated by the broken release' -NoNewline
}
$body = '{"status":"' + $status + '","version":"' + $Version + '","worker":{"running":true,"databaseTarget":"db","configuredDatabase":"db"},"database":{"schema":{"applied":' + $applied + '}}}'
Set-Content -Path (Join-Path $DataDir 'health.json') -Value $body
Write-Output "stub service started as $Version"
'@

  # The release: one app component.
  $stage = Join-Path $root 'stage'
  New-Item -ItemType Directory -Path "$stage\app" -Force | Out-Null
  Write-Text "$stage\app\marker.txt" 'new'
  Copy-Item $verifier "$stage\app\verify-update.mjs"
  if ($BrokenRelease) { Write-Text "$stage\app\broken" '' }
  $versionDir = "$data\updates\0.2.1"
  & tar.exe -a -c -f "$versionDir\app.zip" -C $stage app
  & node (Join-Path $PSScriptRoot 'sign-release.mjs') $repo $versionDir '0.2.1'
  if ($LASTEXITCODE -ne 0) { throw 'Signing the fake release failed (is the release key present?).' }
  if ($TamperZip) { Add-Content -Path "$versionDir\app.zip" -Value 'x' }
  Write-Text "$data\updates\request.json" ('{"version":"' + $RequestVersion + '","requestedBy":"harness","requestedAt":"2026-11-05T00:00:00Z"}')
  [pscustomobject]@{ Install = $inst; Data = $data }
}

function Invoke-Apply($fake) {
  & (Join-Path $repo 'installer\apply-update.ps1') -InstallDir $fake.Install -DataDir $fake.Data -HealthTimeoutSeconds 9 -NoPrivilegedSteps | Out-Null
  (Get-Content "$($fake.Data)\updates\status.json" -Raw) | ConvertFrom-Json
}

$server = $null
try {
  $healthFile = Join-Path $work 'current-health.json'
  # The fake service of whichever scenario is running: each scenario points this at its own file.
  $server = Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $PSScriptRoot 'fake-health.mjs'), $port, $healthFile) -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 1

  function Use-Fake($fake) {
    # The server reads one fixed file; make it a hard link to the scenario's own state file.
    if (Test-Path $healthFile) { Remove-Item $healthFile -Force }
    New-Item -ItemType HardLink -Path $healthFile -Target "$($fake.Data)\health.json" | Out-Null
  }

  Write-Output 'Scenario A: a healthy release is installed'
  $a = New-FakeInstall 'a'; Use-Fake $a
  $s = Invoke-Apply $a
  Check 'outcome succeeded' ($s.phase -eq 'succeeded' -and $s.history[0].outcome -eq 'succeeded')
  Check 'new app in place' ((Get-Content "$($a.Install)\app\marker.txt" -Raw) -eq 'new')
  Check 'old app kept as app.previous' ((Get-Content "$($a.Install)\app.previous\marker.txt" -Raw) -eq 'old')
  Check 'installed.json records 0.2.1' (((Get-Content "$($a.Install)\installed.json" -Raw) | ConvertFrom-Json).version -eq '0.2.1')
  Check 'hold lifted' (-not (Test-Path "$($a.Data)\updates\hold"))
  Check 'staging, lock and request gone' (-not (Test-Path "$($a.Install)\.update-staging") -and -not (Test-Path "$($a.Data)\updates\lock") -and -not (Test-Path "$($a.Data)\updates\request.json"))
  Check 'database untouched' ((Get-Content "$($a.Data)\app.db" -Raw) -eq 'before')

  Write-Output 'Scenario B: a release that migrates and never becomes healthy is rolled back'
  $b = New-FakeInstall 'b' -BrokenRelease; Use-Fake $b
  $s = Invoke-Apply $b
  Check 'outcome rolled-back' ($s.phase -eq 'rolled-back')
  Check 'old app back in place' ((Get-Content "$($b.Install)\app\marker.txt" -Raw) -eq 'old')
  Check 'broken app kept as app.failed' (Test-Path "$($b.Install)\app.failed\broken")
  Check 'database restored from the pre-update backup' ((Get-Content "$($b.Data)\app.db" -Raw).Trim() -eq 'before')
  Check 'installed.json still 0.2.0' (((Get-Content "$($b.Install)\installed.json" -Raw) | ConvertFrom-Json).version -eq '0.2.0')
  Check 'hold lifted after a good rollback' (-not (Test-Path "$($b.Data)\updates\hold"))

  Write-Output 'Scenario C: an archive changed after download is refused'
  $c = New-FakeInstall 'c' -TamperZip; Use-Fake $c
  $s = Invoke-Apply $c
  # Appending a byte changes the size, which the verifier checks before the hash.
  Check 'outcome aborted, naming the archive' ($s.phase -eq 'aborted' -and $s.history[0].reason -like '*mismatch: app*')
  Check 'nothing swapped' ((Get-Content "$($c.Install)\app\marker.txt" -Raw) -eq 'old' -and -not (Test-Path "$($c.Install)\app.previous"))
  Check 'service never stopped' ((Get-Content "$($c.Data)\health.json" -Raw) -ne 'down')

  Write-Output 'Scenario D: a request for a version that is not newer is refused'
  $d = New-FakeInstall 'd' -RequestVersion '0.2.0'; Use-Fake $d
  $s = Invoke-Apply $d
  Check 'outcome aborted, saying why' ($s.phase -eq 'aborted' -and $s.history[0].reason -like '*yeni degil*')
  Check 'nothing swapped' (-not (Test-Path "$($d.Install)\app.previous"))
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($script:failures -gt 0) { Write-Output "$($script:failures) check(s) failed."; exit 1 }
Write-Output 'All checks passed.'
