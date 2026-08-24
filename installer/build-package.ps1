<#
  Doc 14 section 8 -- assemble the staging tree the Inno Setup script packs, then compile it.

  Must run on Windows. That is not a preference: `better-sqlite3` is compiled against a specific
  Node ABI, and a package that pairs a Linux-built `node_modules` with a Windows `node.exe`
  fails at the customer's first request rather than in CI (doc 14 section 3.1). Step "Verify Node ABI"
  below asserts the pairing instead of trusting it.

  Usage (from the repository root):
    powershell -ExecutionPolicy Bypass -File installer\build-package.ps1
    powershell -ExecutionPolicy Bypass -File installer\build-package.ps1 -SkipTests   # local iteration only
#>
[CmdletBinding()]
param(
  [string] $Version,
  [switch] $SkipTests,
  [switch] $SkipCompile,
  [switch] $SkipSmokeTest
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$staging  = Join-Path $PSScriptRoot 'staging'
$outDir   = Join-Path $PSScriptRoot 'out'
$webDir   = Join-Path $repoRoot 'apps\web'

if (-not $Version) {
  $Version = (Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
}
Write-Output "== BuyBox installer package $Version =="

# --- 1. Clean staging ---------------------------------------------------------------------------
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# --- 2. Build (and, unless skipped, prove the build is green) --------------------------------------
Push-Location $repoRoot
try {
  if (-not $SkipTests) {
    Write-Output '-- typecheck'; npm run typecheck; if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }
    Write-Output '-- test';      npm test;          if ($LASTEXITCODE -ne 0) { throw 'tests failed' }
  }
  Write-Output '-- build'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'build failed' }
} finally {
  Pop-Location
}

# --- 3. Assemble app\ from the standalone output ----------------------------------------------------
# `output: 'standalone'` produces a self-contained server but does NOT copy `.next/static` or
# `public` (doc 14 section 4.2) -- a package without them serves a page with no CSS and no images.
$standalone = Join-Path $webDir '.next\standalone'
if (-not (Test-Path $standalone)) {
  throw "Standalone output missing at $standalone. Is `output: 'standalone'` still set in apps/web/next.config.ts?"
}

$appDir = Join-Path $staging 'app'
Copy-Item $standalone $appDir -Recurse -Force

# In a workspace build the standalone tree mirrors the monorepo (apps/web/server.js). Flatten it
# so the service's command line does not have to know the repository's shape.
$nestedServer = Join-Path $appDir 'apps\web\server.js'
if (Test-Path $nestedServer) {
  $nestedRoot = Join-Path $appDir 'apps\web'
  Get-ChildItem $nestedRoot -Force | ForEach-Object {
    Move-Item $_.FullName (Join-Path $appDir $_.Name) -Force
  }
  Remove-Item (Join-Path $appDir 'apps') -Recurse -Force
}
if (-not (Test-Path (Join-Path $appDir 'server.js'))) { throw 'server.js not found in the assembled app directory.' }

Copy-Item (Join-Path $webDir '.next\static') (Join-Path $appDir '.next\static') -Recurse -Force
$publicDir = Join-Path $webDir 'public'
if (Test-Path $publicDir) { Copy-Item $publicDir (Join-Path $appDir 'public') -Recurse -Force }

Copy-Item (Join-Path $PSScriptRoot 'boot.mjs') (Join-Path $appDir 'boot.mjs') -Force

# !! Next's standalone output copies the developer's `.env*` files into the package. Measured
# 2026-08-24: apps/web/.env.local, SECRET_STORE_KEY and all, landed in stagingpp.
#
# Shipping that would give every customer the same secret-store key -- the key that protects
# their marketplace credentials -- and would put a credential in a distributed artefact, which
# CLAUDE.md forbids outright. The installed environment is written on the customer's machine at
# install time (configure-env.ps1) and must be the only one in existence.
$leakedEnv = Get-ChildItem $appDir -Recurse -Force -File -Filter '.env*' -ErrorAction SilentlyContinue
foreach ($file in $leakedEnv) {
  Write-Output "-- removing $($file.FullName.Substring($appDir.Length + 1)) from the package"
  Remove-Item $file.FullName -Force
}
$stillThere = Get-ChildItem $appDir -Recurse -Force -File -Filter '.env*' -ErrorAction SilentlyContinue
if ($stillThere) { throw "Refusing to package: .env files remain in $appDir." }

# Next's file tracing keeps what it can see being imported. Two things it cannot see, both found
# on a real install 2026-08-24 (doc 14 section 8.2), each of which made every request return 500:
#
# 1. playwright-core reads `browsers.json` at runtime from its own package directory. Tracing
#    copied the library and not the data file, so the instrumentation hook -- which starts the
#    embedded worker, which loads the adapters, which load Playwright -- threw before the server
#    could finish preparing. Overlay the real packages rather than trusting the traced subset.
foreach ($pkg in @('playwright-core', 'playwright')) {
  $source = Join-Path $repoRoot "node_modules\$pkg"
  $target = Join-Path $appDir "node_modules\$pkg"
  if (-not (Test-Path $source)) { throw "$pkg is not installed in the repository; run npm ci." }
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  Copy-Item $source $target -Recurse -Force
}
if (-not (Test-Path (Join-Path $appDir 'node_modules\playwright-core\browsers.json'))) {
  throw 'playwright-core/browsers.json is missing from the package; the app will fail to start.'
}

# 2. The migration SQL files are read from disk at runtime, and `@buybox/db` is bundled
#    (transpilePackages), so the package cannot locate them by relative path at all. Ship them
#    and point BUYBOX_MIGRATIONS_DIR at them (BuyBoxApp.xml.template).
$migrationsSource = Join-Path $repoRoot 'packages\db\migrations'
if (-not (Test-Path (Join-Path $migrationsSource 'sqlite\meta\_journal.json'))) {
  throw "Migrations not found at $migrationsSource."
}
Copy-Item $migrationsSource (Join-Path $appDir 'migrations') -Recurse -Force

# --- 4. Bundle the Node runtime ---------------------------------------------------------------------
$nodeDir = Join-Path $staging 'node'
New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
$nodeSource = (Get-Command node).Source
Copy-Item $nodeSource (Join-Path $nodeDir 'node.exe') -Force

# --- 5. Verify the Node ABI matches the native modules we just built ----------------------------------
# The assertion doc 14 section 3.1 exists for. `better-sqlite3` is the one that matters; loading it under
# the bundled runtime is a stronger check than comparing version strings.
$sqliteEntry = Join-Path $appDir 'node_modules\better-sqlite3\lib\index.js'
if (-not (Test-Path $sqliteEntry)) {
  throw "better-sqlite3 is not in the standalone output ($sqliteEntry). It must be, or the packaged app has no database driver."
}
Push-Location $appDir
try {
  & (Join-Path $nodeDir 'node.exe') -e "const D=require('better-sqlite3'); const d=new D(':memory:'); d.exec('create table t(x)'); d.close(); process.stdout.write('abi-ok')"
  if ($LASTEXITCODE -ne 0) {
    throw 'Node ABI mismatch: the bundled node.exe cannot load the better-sqlite3 binary built by npm ci. Build the package on the same Node major version you install with (doc 14 section 3.1).'
  }
} finally {
  Pop-Location
}

# --- 6. Chromium ---------------------------------------------------------------------------------------
$chromiumDir = Join-Path $staging 'chromium'
New-Item -ItemType Directory -Path $chromiumDir -Force | Out-Null
$env:PLAYWRIGHT_BROWSERS_PATH = $chromiumDir
Push-Location $repoRoot
try {
  npx playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw 'playwright install chromium failed' }
} finally {
  Pop-Location
  Remove-Item Env:\PLAYWRIGHT_BROWSERS_PATH -ErrorAction SilentlyContinue
}

# --- 7. Scripts and the service wrapper -------------------------------------------------------------------
$scriptsDir = Join-Path $staging 'scripts'
New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
foreach ($name in @('preflight.ps1', 'configure-env.ps1', 'install-service.ps1', 'verify-health.ps1', 'uninstall-service.ps1')) {
  $source = Join-Path $PSScriptRoot $name
  # These scripts must be pure ASCII. Windows PowerShell 5.1 -- which is what a customer machine
  # runs, and what the installer invokes -- reads a BOM-less UTF-8 file as ANSI, so a single
  # em dash or section sign turns into mojibake that can terminate a string early and make the
  # script fail to *parse*. Measured 2026-08-24: it cost a whole build. Turkish messages are
  # written without diacritics for the same reason.
  $nonAscii = (Get-Content $source -Raw).ToCharArray() | Where-Object { [int]$_ -gt 127 }
  if ($nonAscii) {
    throw "$name contains non-ASCII characters ($($nonAscii -join '')). PowerShell 5.1 will mis-read them; keep installer scripts ASCII-only."
  }
  Copy-Item $source (Join-Path $scriptsDir $name) -Force
}

$serviceDir = Join-Path $staging 'service'
New-Item -ItemType Directory -Path $serviceDir -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'BuyBoxApp.xml.template') (Join-Path $serviceDir 'BuyBoxApp.xml.template') -Force

$winswSource = Join-Path $PSScriptRoot 'vendor\WinSW.exe'
if (-not (Test-Path $winswSource)) {
  throw "WinSW is missing at $winswSource. See installer\README-build.md -- it is a vendored binary, downloaded once and checked against its hash, not fetched during a build."
}
Copy-Item $winswSource (Join-Path $serviceDir 'BuyBoxApp.exe') -Force

# --- 8. Smoke test: boot the assembled package and require a healthy answer -------------------------------
# This exists because two packaging bugs shipped in the first build (doc 14 section 8.2). Both
# made every request return 500, and neither was visible in anything short of running the thing:
# typecheck, tests and the ABI assertion were all green. The only check that would have caught
# them is the one that starts the package the way the service starts it.
#
# It demands `status: ok`, not merely an HTTP 200. `/api/health` answers 200 while degraded on
# purpose (doc 14 section 5.1), so a 200 alone proves nothing about whether the app works.
if (-not $SkipSmokeTest) {
  Write-Output '-- smoke test'
  $smokeDir = Join-Path $env:TEMP "buybox-smoke-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  New-Item -ItemType Directory -Path $smokeDir -Force | Out-Null
  $smokePort = 3999
  $smokeKey = & (Join-Path $nodeDir 'node.exe') -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
  # Deliberately RELATIVE. An absolute path cannot reproduce the 2026-08-24 split, where the
  # embedded worker and the web half resolved one setting into two different files because Next
  # chdirs during boot. With BUYBOX_DATA_DIR set (as the service sets it) both must land on the
  # same file, and the assertion below is what proves it.
  Set-Content -Path (Join-Path $smokeDir '.env.local') -Encoding utf8 -Value @(
    "DATABASE_URL=file:./data/app.db",
    "SECRET_STORE_KEY=$smokeKey",
    "SECRET_STORE_PATH=$(Join-Path $smokeDir 'secrets.enc.json')",
    'SINGLE_PROCESS=1'
  )

  $env:NODE_ENV = 'production'
  $env:PORT = "$smokePort"
  $env:HOSTNAME = '127.0.0.1'
  $env:AUTO_MIGRATE = '1'
  $env:APP_VERSION = $Version
  $env:PLAYWRIGHT_BROWSERS_PATH = $chromiumDir
  $env:BUYBOX_MIGRATIONS_DIR = (Join-Path $appDir 'migrations')
  $env:BUYBOX_DATA_DIR = $smokeDir

  $logPath = Join-Path $smokeDir 'smoke.log'
  $proc = Start-Process -FilePath (Join-Path $nodeDir 'node.exe') `
    -ArgumentList (Join-Path $appDir 'boot.mjs') `
    -WorkingDirectory $smokeDir -PassThru -NoNewWindow `
    -RedirectStandardOutput $logPath -RedirectStandardError "$logPath.err"

  try {
    $healthy = $false
    $lastSeen = '(no response)'
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
      try {
        $body = Invoke-RestMethod -Uri "http://127.0.0.1:$smokePort/api/health" -TimeoutSec 5
        $lastSeen = ($body | ConvertTo-Json -Compress -Depth 6)
        if ($body.status -eq 'ok') { $healthy = $true; break }
      } catch {
        $lastSeen = $_.Exception.Message
      }
      Start-Sleep -Seconds 3
    }

    if (-not $healthy) {
      Write-Output '--- smoke log ---'
      if (Test-Path $logPath) { Get-Content $logPath -Tail 40 | Write-Output }
      if (Test-Path "$logPath.err") { Get-Content "$logPath.err" -Tail 40 | Write-Output }
      throw "Smoke test failed: the packaged app never reported healthy. Last response: $lastSeen"
    }

    # The worker must be running, and on the SAME database as the web half. This is the check
    # that would have caught the failure the first customer install actually hit (doc 14 section
    # 8.4): a healthy web server, a healthy worker, two databases, and every job queued forever.
    # `status: ok` alone does not cover it -- both halves were individually fine.
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$smokePort/api/health" -TimeoutSec 10
    if (-not $health.worker.running) {
      throw 'Smoke test failed: the embedded worker is not running in the packaged app.'
    }
    if ($health.worker.databaseTarget -ne $health.worker.configuredDatabase) {
      throw "Smoke test failed: worker database '$($health.worker.databaseTarget)' does not match configured '$($health.worker.configuredDatabase)'."
    }
    Write-Output "-- worker running on $($health.worker.databaseTarget)"

    # The licence gate must send an unlicensed install to /license, not to an error page. This is
    # what a customer sees first, and it is what returned 500 on the first real install.
    try {
      $root = Invoke-WebRequest -Uri "http://127.0.0.1:$smokePort/" -MaximumRedirection 0 -UseBasicParsing -TimeoutSec 10
      $rootStatus = $root.StatusCode
    } catch {
      $rootStatus = $_.Exception.Response.StatusCode.value__
    }
    if ($rootStatus -ge 500) { throw "Smoke test failed: / returned $rootStatus." }

    Write-Output "-- smoke test passed (health ok, / returned $rootStatus)"
  } finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    foreach ($name in @('PORT','HOSTNAME','AUTO_MIGRATE','APP_VERSION','PLAYWRIGHT_BROWSERS_PATH','BUYBOX_MIGRATIONS_DIR','BUYBOX_DATA_DIR')) {
      Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
    }
    Remove-Item $smokeDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# --- 9. Compile ------------------------------------------------------------------------------------------
if ($SkipCompile) {
  Write-Output "Staging ready at $staging (compile skipped)."
  exit 0
}

# Inno Setup's location is not fixed: winget installs it per-user under %LOCALAPPDATA%\Programs,
# its own installer defaults to Program Files, and Chocolatey (what CI uses) puts it somewhere
# else again. Measured 2026-08-24, when a build failed on a machine that had it installed. Ask
# the uninstall registry first -- every one of them writes it -- then fall back to the known
# directories and to PATH.
$isccCandidates = @()
foreach ($hive in @('HKLM:', 'HKCU:')) {
  foreach ($view in @('SOFTWARE', 'SOFTWARE\WOW6432Node')) {
    $key = "$hive\$view\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1"
    $location = (Get-ItemProperty -Path $key -Name 'InstallLocation' -ErrorAction SilentlyContinue).InstallLocation
    if ($location) { $isccCandidates += (Join-Path $location 'ISCC.exe') }
  }
}
$isccCandidates += @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)
$isccCandidates += (Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)

$iscc = $isccCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $iscc) { throw 'Inno Setup 6 (ISCC.exe) not found. See installer\README-build.md.' }
Write-Output "-- compiling with $iscc"

& $iscc "/DAppVersion=$Version" "/O$outDir" (Join-Path $PSScriptRoot 'buybox.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed' }

# Doc 14 section 9: until packages are signed, the published hash is how a customer can tell they have
# what we built.
$setupExe = Join-Path $outDir "BuyBoxSetup-$Version.exe"
$hash = (Get-FileHash $setupExe -Algorithm SHA256).Hash
Set-Content -Path "$setupExe.sha256" -Value "$hash  BuyBoxSetup-$Version.exe" -Encoding ascii

Write-Output ''
Write-Output "Package: $setupExe"
Write-Output "SHA-256: $hash"
