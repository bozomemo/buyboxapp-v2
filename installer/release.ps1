<#
  Build a release: component archives, an install layout, optionally the full installer, and
  (Task 4) a signed update.json published to GitHub.
  Spec: docs/superpowers/specs/2026-11-04-auto-update-design.md section 4.

  Why it builds in BUYBOX_BUILD_ROOT (default C:\BuyBoxBuild) and not in the repository: the
  repository lives under OneDrive, and every build used to write ~1.1 GB of small files and a
  ~385 MB installer into a synced folder. Builds took hours. Building from a clean checkout of a
  commit also means developer state (.env.local, app.db) cannot reach the package at all; the
  forbidden-state assertion below stays as a second line.

  Why components: ~900 MB of the package (Chromium, node.exe, Alloy) does not change between
  releases. Each component is a zip cached by a key derived from its inputs, so a release that
  only changes the app rebuilds only the app.

  Must run on Windows, for the native-module reason in doc 14 section 3.1; the ABI check below
  asserts the pairing instead of trusting it.

  Usage (from the repository root):
    powershell -ExecutionPolicy Bypass -File installer\release.ps1 -NoPublish -FullInstaller
#>
[CmdletBinding()]
param(
  [string] $Version,
  [string] $Ref,
  [string] $NotesFile,
  [switch] $SkipTests,
  [switch] $SkipSmokeTest,
  [switch] $FullInstaller,
  [switch] $NoPublish,
  # Public, artefacts only, no source (spec decision D2). A scratch repository for trying the
  # publish step out is passed here, never edited into the default.
  [string] $ReleasesRepo = 'bozomemo/buybox-releases',
  [switch] $SkipTagPush
)

$ErrorActionPreference = 'Stop'

$sourceRepo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Root = $env:BUYBOX_BUILD_ROOT
if (-not $Root) { $Root = 'C:\BuyBoxBuild' }
$src = Join-Path $Root 'src'
$cacheDir = Join-Path $Root 'cache'
$componentCache = Join-Path $cacheDir 'components'
New-Item -ItemType Directory -Path $componentCache -Force | Out-Null

# --- Step timing ----------------------------------------------------------------------------------
# Every step reports its duration, so the next decision about the build (for example whether tests
# belong in it) is made on numbers. Nobody knew where the hours went before this existed.
$script:stepTimes = New-Object System.Collections.ArrayList
function Invoke-Step {
  param([Parameter(Mandatory)] [string] $Name, [Parameter(Mandatory)] [scriptblock] $Body)
  Write-Output "-- $Name"
  $watch = [Diagnostics.Stopwatch]::StartNew()
  try {
    & $Body
  } finally {
    $watch.Stop()
    $elapsed = '{0}m{1:00}s' -f [int][Math]::Floor($watch.Elapsed.TotalMinutes), $watch.Elapsed.Seconds
    [void]$script:stepTimes.Add([pscustomobject]@{ Step = $Name; Time = $elapsed; Seconds = [int]$watch.Elapsed.TotalSeconds })
    Write-Output "-- $Name $elapsed"
  }
}

function Assert-Exit {
  param([string] $What)
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

# Runs a native command. Under ErrorActionPreference=Stop, Windows PowerShell 5.1 turns a native
# program's stderr into a terminating NativeCommandError when output is captured -- git and npm
# both write progress to stderr -- so success is judged by the exit code alone, via Assert-Exit.
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

function Get-Sha256 {
  param([Parameter(Mandatory)] [string] $Path)
  (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# A short key over a set of files: the sha256 of every file's own hash, in sorted relative-path
# order, so a renamed file changes the key as surely as an edited one.
function Get-InputKey {
  param([Parameter(Mandatory)] [hashtable] $Files)
  $lines = foreach ($name in ($Files.Keys | Sort-Object)) { "$name $(Get-Sha256 $Files[$name])" }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
  $sha = [Security.Cryptography.SHA256]::Create()
  (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 12)
}

function Write-Utf8NoBom {
  param([Parameter(Mandatory)] [string] $Path, [Parameter(Mandatory)] [string] $Text)
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

# --- 1. Clean checkout of the release commit ------------------------------------------------------
if (-not $Ref) {
  $dirty = Exec { git -C $sourceRepo status --porcelain }
  Assert-Exit 'git status'
  if ($dirty) {
    throw 'Calisma agaci temiz degil: commit edin ya da -Ref <commit> verin. A release is built from a commit, never from uncommitted files.'
  }
  $Ref = 'HEAD'
}
$commit = ((Exec { git -C $sourceRepo rev-parse --verify "$Ref^{commit}" }) | Select-Object -Last 1).Trim()
Assert-Exit "Resolving $Ref"

# A publish is refused up front, not after an hour of building, when it could not succeed or
# should not happen: an unverified build is never published.
$signingKey = Join-Path $env:USERPROFILE '.buybox\release-signing-key.pem'
if (-not $NoPublish) {
  if ($SkipTests -or $SkipSmokeTest) { throw 'A release built with -SkipTests or -SkipSmokeTest is never published. Add -NoPublish.' }
  if (-not $NotesFile -or -not (Test-Path $NotesFile)) { throw 'Publishing needs -NotesFile <path>: the Turkish release notes shown on Settings > Guncelleme.' }
  $NotesFile = (Resolve-Path $NotesFile).Path
  if (-not (Test-Path $signingKey)) { throw "Release signing key not found at $signingKey (scripts/generate-release-keypair.mjs)." }
  Exec { gh auth status } | Out-Null
  Assert-Exit 'gh auth status (run gh auth login)'
}

# node_modules and Next's build cache survive between builds by being *moved* out of the old
# checkout and back into the new one. A rename is instant, and npm's workspace junctions point
# at $src\packages\..., which is the same path in every build, so they stay valid.
$nodeModulesCacheRoot = Join-Path $cacheDir 'node_modules'
$nextCache = Join-Path $cacheDir 'next-cache'
New-Item -ItemType Directory -Path $nodeModulesCacheRoot -Force | Out-Null

Invoke-Step 'checkout' {
  if (Test-Path $src) {
    $stampPath = Join-Path $src 'node_modules\.buybox-cache-key'
    if (Test-Path $stampPath) {
      $oldKey = (Get-Content $stampPath -Raw).Trim()
      $parked = Join-Path $nodeModulesCacheRoot $oldKey
      if (-not (Test-Path $parked)) { Move-Item (Join-Path $src 'node_modules') $parked }
    }
    $oldNextCache = Join-Path $src 'apps\web\.next\cache'
    if (Test-Path $oldNextCache) {
      if (Test-Path $nextCache) { Remove-Item $nextCache -Recurse -Force }
      Move-Item $oldNextCache $nextCache
    }
    Exec { git -C $sourceRepo worktree remove --force $src } | Out-Null
    if (Test-Path $src) { Remove-Item $src -Recurse -Force }
  }
  Exec { git -C $sourceRepo worktree prune } | Out-Null
  Exec { git -C $sourceRepo worktree add --detach --force $src $commit }
  Assert-Exit 'git worktree add'
}

if (-not $Version) {
  $Version = (Get-Content (Join-Path $src 'package.json') -Raw | ConvertFrom-Json).version
}
$outDir = Join-Path $Root "out\$Version"
if (Test-Path $outDir) { Remove-Item $outDir -Recurse -Force }
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Start-Transcript -Path (Join-Path $outDir "build-$Version.log") | Out-Null

try {
Write-Output "== BuyBox release $Version from $commit =="
Write-Output "Build root: $Root"

$webDir = Join-Path $src 'apps\web'
$srcInstaller = Join-Path $src 'installer'

# --- 1b. Pinned Node runtime ---------------------------------------------------------------------
# The bundled node.exe used to be whatever `node` was on the build machine's PATH (v25 on the
# owner's machine, while the README says 22). The owner decided on 2026-11-05 to pin Node 22 LTS
# without installing it: the official portable zip is downloaded once into the build cache,
# checked against the hash below (from nodejs.org/dist/v<ver>/SHASUMS256.txt), and put first on
# PATH *for this process only*. The whole build -- npm ci, tests, next build, the ABI check and
# the node component -- then runs on the same runtime the install will run on, which matters
# because native modules are chosen per ABI. The machine's own Node is never touched.
$pinnedNodeVersion = 'v22.23.4'
$pinnedNodeZipSha256 = 'cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20'

Invoke-Step 'node runtime' {
  $name = "node-$pinnedNodeVersion-win-x64"
  $runtimeRoot = Join-Path $cacheDir 'node-runtime'
  $nodeHome = Join-Path $runtimeRoot $name
  if (-not (Test-Path (Join-Path $nodeHome 'node.exe'))) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $zip = Join-Path $runtimeRoot "$name.zip"
    Write-Output "Downloading $name.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$pinnedNodeVersion/$name.zip" -OutFile $zip
    $actual = Get-Sha256 $zip
    if ($actual -ne $pinnedNodeZipSha256) {
      Remove-Item $zip -Force
      throw "$name.zip hash mismatch: expected $pinnedNodeZipSha256, got $actual"
    }
    if (Test-Path $nodeHome) { Remove-Item $nodeHome -Recurse -Force }
    Exec { & tar.exe -x -f $zip -C $runtimeRoot }
    Assert-Exit "Extracting $name.zip"
    Remove-Item $zip -Force
  }
  $env:PATH = "$nodeHome;$env:PATH"
  $resolved = (Get-Command node).Source
  $running = ((Exec { node --version }) | Select-Object -Last 1).Trim()
  if ($running -ne $pinnedNodeVersion) { throw "Expected node $pinnedNodeVersion on PATH, got $running ($resolved)" }
  Write-Output "Building with $resolved ($running)"
}

# --- 2. Dependencies --------------------------------------------------------------------------------
# Keyed by the lockfile and the Node version: a native module built for one ABI is not the same
# dependency tree under another. Install scripts are skipped on purpose -- better-sqlite3 ships
# win32-x64 prebuilds in its package, the ABI check below proves they load under the bundled
# runtime, and Playwright's postinstall would download a Chromium the chromium component owns.
$nodeVersion = ((Exec { node --version }) | Select-Object -Last 1).Trim()
$lockHash = (Get-Sha256 (Join-Path $src 'package-lock.json')).Substring(0, 16)
$depsKey = "$lockHash-$nodeVersion"

Invoke-Step 'dependencies' {
  $parked = Join-Path $nodeModulesCacheRoot $depsKey
  if (Test-Path $parked) {
    Write-Output "node_modules cache hit ($depsKey)"
    Move-Item $parked (Join-Path $src 'node_modules')
  } else {
    Write-Output "node_modules cache miss ($depsKey): npm ci"
    Push-Location $src
    try {
      $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
      Exec { npm ci --ignore-scripts }
      Assert-Exit 'npm ci'
    } finally {
      Remove-Item Env:\PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD -ErrorAction SilentlyContinue
      Pop-Location
    }
  }
  Set-Content -Path (Join-Path $src 'node_modules\.buybox-cache-key') -Value $depsKey -Encoding ascii
  if (Test-Path $nextCache) {
    New-Item -ItemType Directory -Path (Join-Path $webDir '.next') -Force | Out-Null
    Move-Item $nextCache (Join-Path $webDir '.next\cache')
  }
}

# --- 3. Typecheck, test, build ----------------------------------------------------------------------
Push-Location $src
try {
  if (-not $SkipTests) {
    Invoke-Step 'typecheck' { Exec { npm run typecheck }; Assert-Exit 'typecheck' }
    # The database suite runs every repository test against SQLite and PostgreSQL here; PostgreSQL
    # needs its container, started here and stopped afterwards, so the build does not depend on
    # someone having remembered to. MySQL is left out of release builds (owner, 2026-11-05): it
    # made the suite take hours and no install runs on it. CI still covers all three dialects.
    Invoke-Step 'test' {
      $compose = Join-Path $src 'packages\db\docker-compose.test.yml'
      Exec { docker compose -f $compose up -d --wait postgres }
      Assert-Exit 'Starting the PostgreSQL test container (is Docker Desktop running?)'
      $env:BUYBOX_TEST_DIALECTS = 'sqlite,postgres'
      try {
        Exec { npm test }
        Assert-Exit 'tests'
      } finally {
        Remove-Item Env:\BUYBOX_TEST_DIALECTS -ErrorAction SilentlyContinue
        Exec { docker compose -f $compose down } | Out-Null
      }
    }
  }
  # One retry, logged. Measured 2026-11-05: the first `next build` in a fresh checkout failed in
  # next/font/google ("queries have exactly one entry") while downloading IBM Plex, and the same
  # tree built cleanly on the next attempt. The Next cache kept between builds holds the fonts
  # from then on, so this only ever bites a first build.
  Invoke-Step 'build' {
    Exec { npm run build }
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'npm run build failed once; retrying (see the font note in release.ps1).'
      Exec { npm run build }
    }
    Assert-Exit 'build'
  }
} finally {
  Pop-Location
}

# --- 4. Assemble app\ ---------------------------------------------------------------------------------
# Doc 14 section 8. Everything here moved from build-package.ps1 unchanged in substance.
$forbiddenInPackage = @('.env*', '*.db', '*.db-wal', '*.db-shm', '*.sqlite', '*.sqlite3', 'secrets.enc.json')

function Get-PackagedDeveloperState {
  param([Parameter(Mandatory)] [string] $Root, [Parameter(Mandatory)] [string[]] $Patterns)
  $found = @()
  foreach ($pattern in $Patterns) {
    $found += Get-ChildItem $Root -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue
  }
  # The developer's SQLite directory has no meaning inside the package (doc 14 section 8.1).
  $dataDir = Join-Path $Root 'data'
  if (Test-Path $dataDir) { $found += Get-Item $dataDir }
  $found
}

function New-AppDir {
  param([Parameter(Mandatory)] [string] $Into)
  # `output: 'standalone'` does NOT copy `.next/static` or `public` (doc 14 section 4.2).
  $standalone = Join-Path $webDir '.next\standalone'
  if (-not (Test-Path $standalone)) {
    throw "Standalone output missing at $standalone. Is `output: 'standalone'` still set in apps/web/next.config.ts?"
  }
  Copy-Item $standalone $Into -Recurse -Force

  # In a workspace build the standalone tree mirrors the monorepo (apps/web/server.js). Flatten it.
  $nestedServer = Join-Path $Into 'apps\web\server.js'
  if (Test-Path $nestedServer) {
    $nestedRoot = Join-Path $Into 'apps\web'
    Get-ChildItem $nestedRoot -Force | ForEach-Object { Move-Item $_.FullName (Join-Path $Into $_.Name) -Force }
    Remove-Item (Join-Path $Into 'apps') -Recurse -Force
  }
  if (-not (Test-Path (Join-Path $Into 'server.js'))) { throw 'server.js not found in the assembled app directory.' }

  Copy-Item (Join-Path $webDir '.next\static') (Join-Path $Into '.next\static') -Recurse -Force
  $publicDir = Join-Path $webDir 'public'
  if (Test-Path $publicDir) { Copy-Item $publicDir (Join-Path $Into 'public') -Recurse -Force }
  Copy-Item (Join-Path $srcInstaller 'boot.mjs') (Join-Path $Into 'boot.mjs') -Force

  # The break-glass command (doc 18 section 8.3), bundled beside server.js.
  Exec { & node (Join-Path $src 'scripts\build-admin-cli.mjs') (Join-Path $Into 'admin.mjs') }
  Assert-Exit 'Bundling the admin command (scripts/build-admin-cli.mjs)'
  # The release verifier apply-update.ps1 runs from the *installed* app before it trusts a
  # download (auto-update spec section 6 step 2).
  Exec { & node (Join-Path $src 'scripts\build-verify-update.mjs') (Join-Path $Into 'verify-update.mjs') }
  Assert-Exit 'Bundling the release verifier (scripts/build-verify-update.mjs)'

  # Developer state is purged, and the build refuses to continue if any survived (doc 14 section 8.1).
  foreach ($item in Get-PackagedDeveloperState -Root $Into -Patterns $forbiddenInPackage) {
    Write-Output "-- removing $($item.FullName.Substring($Into.Length + 1)) from the package"
    Remove-Item $item.FullName -Recurse -Force
  }

  # playwright-core reads browsers.json at runtime; tracing misses it (doc 14 section 8.2).
  foreach ($pkg in @('playwright-core', 'playwright')) {
    $source = Join-Path $src "node_modules\$pkg"
    $target = Join-Path $Into "node_modules\$pkg"
    if (-not (Test-Path $source)) { throw "$pkg is not installed in the build checkout." }
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Copy-Item $source $target -Recurse -Force
  }
  if (-not (Test-Path (Join-Path $Into 'node_modules\playwright-core\browsers.json'))) {
    throw 'playwright-core/browsers.json is missing from the package; the app will fail to start.'
  }

  # Migration SQL is read from disk at runtime (BUYBOX_MIGRATIONS_DIR, doc 14 section 8.2).
  $migrationsSource = Join-Path $src 'packages\db\migrations'
  if (-not (Test-Path (Join-Path $migrationsSource 'sqlite\meta\_journal.json'))) {
    throw "Migrations not found at $migrationsSource."
  }
  Copy-Item $migrationsSource (Join-Path $Into 'migrations') -Recurse -Force

  $leaked = Get-PackagedDeveloperState -Root $Into -Patterns $forbiddenInPackage
  if ($leaked) {
    $names = ($leaked | ForEach-Object { $_.FullName.Substring($Into.Length + 1) }) -join ', '
    throw "Refusing to package: developer state present in $Into -- $names"
  }
}

# --- 5. Components -----------------------------------------------------------------------------------
# Installer scripts must be pure ASCII: PowerShell 5.1 reads a BOM-less UTF-8 file as ANSI, and
# one em dash can make a script fail to *parse* on the customer's machine (doc 14 section 8.4).
$runtimeScripts = @('preflight.ps1', 'stop-service.ps1', 'configure-env.ps1', 'install-service.ps1', 'install-monitoring.ps1', 'verify-health.ps1', 'uninstall-service.ps1', 'apply-update.ps1', 'register-updater-task.ps1')
foreach ($name in $runtimeScripts) {
  $nonAscii = (Get-Content (Join-Path $srcInstaller $name) -Raw).ToCharArray() | Where-Object { [int]$_ -gt 127 }
  if ($nonAscii) { throw "$name contains non-ASCII characters ($($nonAscii -join '')). Keep installer scripts ASCII-only." }
}

# WinSW is committed (installer\vendor); Alloy is not -- it is over GitHub's 100 MB file limit --
# so it is taken from the source repository's vendor directory, not from the clean checkout.
$winswSource = Join-Path $srcInstaller 'vendor\WinSW.exe'
if (-not (Test-Path $winswSource)) { throw "WinSW is missing at $winswSource. See installer\README-build.md." }
$alloySource = Join-Path $sourceRepo 'installer\vendor\alloy-installer-windows-amd64.exe'

$playwrightVersion = (Get-Content (Join-Path $src 'node_modules\playwright-core\package.json') -Raw | ConvertFrom-Json).version

$components = New-Object System.Collections.ArrayList
$stageRoot = Join-Path $Root 'stage'

# Builds one component: on a cache hit the zip is reused untouched; on a miss $Stage fills a
# fresh directory whose top-level directories become the zip's (and the install's) directories.
function Add-Component {
  param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $Key,
    [Parameter(Mandatory)] [scriptblock] $Stage,
    [switch] $NoCache
  )
  $fileName = "$Name-$Key.zip"
  $cached = Join-Path $componentCache $fileName
  if ($NoCache -or -not (Test-Path $cached)) {
    $dir = Join-Path $stageRoot $Name
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    & $Stage $dir
    # @(...) matters: with one top-level directory this is a plain string, and splatting a string
    # hands tar its characters one by one ('a','p','p'). Measured 2026-11-05.
    $top = @(Get-ChildItem $dir -Directory | ForEach-Object { $_.Name })
    if (-not $top) { throw "Component $Name staged nothing." }
    if (Test-Path $cached) { Remove-Item $cached -Force }
    # bsdtar, bundled with Windows 10+, writes zip with -a; Compress-Archive is far slower.
    Exec { & tar.exe -a -c -f $cached -C $dir @top }
    Assert-Exit "Zipping $Name"
    Remove-Item $dir -Recurse -Force
  } else {
    Write-Output "$Name cache hit ($Key)"
  }
  $file = Get-Item $cached
  [void]$components.Add([pscustomobject]@{
    name = $Name; version = $Key; sha256 = (Get-Sha256 $cached); size = [int64]$file.Length; fileName = $fileName
  })
  Copy-Item $cached (Join-Path $outDir $fileName) -Force
}

Invoke-Step 'component app' {
  Add-Component -Name 'app' -Key $Version -NoCache -Stage { param($dir) New-AppDir -Into (Join-Path $dir 'app') }
}

Invoke-Step 'component node' {
  Add-Component -Name 'node' -Key $nodeVersion -Stage {
    param($dir)
    New-Item -ItemType Directory -Path (Join-Path $dir 'node') -Force | Out-Null
    Copy-Item (Get-Command node).Source (Join-Path $dir 'node\node.exe') -Force
  }
}

Invoke-Step 'component chromium' {
  Add-Component -Name 'chromium' -Key "pw-$playwrightVersion" -Stage {
    param($dir)
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $dir 'chromium'
    Push-Location $src
    try {
      Exec { npx playwright install chromium }
      Assert-Exit 'playwright install chromium'
    } finally {
      Pop-Location
      Remove-Item Env:\PLAYWRIGHT_BROWSERS_PATH -ErrorAction SilentlyContinue
    }
  }
}

Invoke-Step 'component runtime' {
  $inputs = @{ 'service\BuyBoxApp.xml.template' = (Join-Path $srcInstaller 'BuyBoxApp.xml.template'); 'service\BuyBoxApp.exe' = $winswSource }
  foreach ($name in $runtimeScripts) { $inputs["scripts\$name"] = Join-Path $srcInstaller $name }
  Add-Component -Name 'runtime' -Key (Get-InputKey $inputs) -Stage {
    param($dir)
    foreach ($rel in $inputs.Keys) {
      $target = Join-Path $dir $rel
      New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
      Copy-Item $inputs[$rel] $target -Force
    }
  }
}

Invoke-Step 'component monitoring' {
  # Absence is a warning, not an error (doc 16): the product works without remote monitoring.
  if (-not (Test-Path $alloySource)) {
    Write-Warning "Alloy is missing at $alloySource. The release has no monitoring component. See installer\vendor\README.md."
    return
  }
  $inputs = @{
    'monitoring\alloy-installer.exe' = $alloySource
    'monitoring\config.alloy.template' = (Join-Path $src 'monitoring\alloy\config.alloy.template')
  }
  Add-Component -Name 'monitoring' -Key (Get-InputKey $inputs) -Stage {
    param($dir)
    New-Item -ItemType Directory -Path (Join-Path $dir 'monitoring') -Force | Out-Null
    foreach ($rel in $inputs.Keys) { Copy-Item $inputs[$rel] (Join-Path $dir $rel) -Force }
  }
}

Write-Utf8NoBom (Join-Path $outDir 'components.json') (ConvertTo-Json -InputObject @($components) -Depth 4)

# --- 6. Layout: exactly what an install holds -------------------------------------------------------
$layout = Join-Path $outDir 'layout'
Invoke-Step 'layout' {
  New-Item -ItemType Directory -Path $layout -Force | Out-Null
  foreach ($component in $components) {
    Exec { & tar.exe -x -f (Join-Path $outDir $component.fileName) -C $layout }
    Assert-Exit "Extracting $($component.name)"
  }
  $installed = [ordered]@{ version = $Version; components = [ordered]@{} }
  foreach ($component in $components) {
    $installed.components[$component.name] = [ordered]@{ version = $component.version; sha256 = $component.sha256 }
  }
  Write-Utf8NoBom (Join-Path $layout 'installed.json') (ConvertTo-Json -InputObject $installed -Depth 4)
}

$nodeExe = Join-Path $layout 'node\node.exe'
$appDir = Join-Path $layout 'app'
$chromiumDir = Join-Path $layout 'chromium'

# --- 7. Verify the Node ABI matches the native modules ----------------------------------------------
Invoke-Step 'abi check' {
  $sqliteEntry = Join-Path $appDir 'node_modules\better-sqlite3\lib\index.js'
  if (-not (Test-Path $sqliteEntry)) { throw "better-sqlite3 is not in the standalone output ($sqliteEntry)." }
  Push-Location $appDir
  try {
    & $nodeExe -e "const D=require('better-sqlite3'); const d=new D(':memory:'); d.exec('create table t(x)'); d.close(); process.stdout.write('abi-ok')"
    if ($LASTEXITCODE -ne 0) { throw 'Node ABI mismatch: the bundled node.exe cannot load better-sqlite3 (doc 14 section 3.1).' }
  } finally {
    Pop-Location
  }
}

# --- 8. Smoke test the layout the way the service boots it --------------------------------------------
# Doc 14 section 8.2: the only check that exercises the package rather than the repository. It
# runs against the extracted components, so what is tested is what is shipped.
if (-not $SkipSmokeTest) {
  Invoke-Step 'smoke test' {
    $smokeDir = Join-Path $env:TEMP "buybox-smoke-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Path $smokeDir -Force | Out-Null
    $smokePort = 3999
    $smokeKey = & $nodeExe -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    # Deliberately RELATIVE: see build history, doc 14 section 8.3.
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
    $proc = Start-Process -FilePath $nodeExe -ArgumentList (Join-Path $appDir 'boot.mjs') `
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
      # Worker running, on the SAME database as the web half (doc 14 section 8.4).
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$smokePort/api/health" -TimeoutSec 10
      if (-not $health.worker.running) { throw 'Smoke test failed: the embedded worker is not running in the packaged app.' }
      if ($health.worker.databaseTarget -ne $health.worker.configuredDatabase) {
        throw "Smoke test failed: worker database '$($health.worker.databaseTarget)' does not match configured '$($health.worker.configuredDatabase)'."
      }
      Write-Output "-- worker running on $($health.worker.databaseTarget)"
      # An unlicensed install must be sent to /license, not to an error page.
      try {
        $rootResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$smokePort/" -MaximumRedirection 0 -UseBasicParsing -TimeoutSec 10
        $rootStatus = $rootResponse.StatusCode
      } catch {
        $rootStatus = $_.Exception.Response.StatusCode.value__
      }
      if ($rootStatus -ge 500) { throw "Smoke test failed: / returned $rootStatus." }
      Write-Output "-- smoke test passed (health ok, / returned $rootStatus)"
    } finally {
      if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
      foreach ($name in @('NODE_ENV', 'PORT', 'HOSTNAME', 'AUTO_MIGRATE', 'APP_VERSION', 'PLAYWRIGHT_BROWSERS_PATH', 'BUYBOX_MIGRATIONS_DIR', 'BUYBOX_DATA_DIR')) {
        Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
      }
      Remove-Item $smokeDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# --- 9. Full installer (new installs only) ----------------------------------------------------------
if ($FullInstaller) {
  Invoke-Step 'full installer' {
    # Inno Setup's location is not fixed (winget per-user, Program Files, Chocolatey). Ask the
    # uninstall registry first, then the known directories and PATH. Measured 2026-08-24.
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

    Exec { & $iscc "/DAppVersion=$Version" "/DLayoutDir=$layout" "/O$outDir" (Join-Path $srcInstaller 'buybox.iss') }
    Assert-Exit 'Inno Setup compilation'

    # Doc 14 section 9: until packages are signed, the published hash is how a customer can tell
    # they have what we built.
    $setupExe = Join-Path $outDir "BuyBoxSetup-$Version.exe"
    $hash = (Get-FileHash $setupExe -Algorithm SHA256).Hash
    Set-Content -Path "$setupExe.sha256" -Value "$hash  BuyBoxSetup-$Version.exe" -Encoding ascii
    Write-Output "Package: $setupExe"
    Write-Output "SHA-256: $hash"
  }
}

# --- 10. Publish -------------------------------------------------------------------------------------
# Spec section 4.6. The release becomes "latest", which is the URL every install polls. Archives
# an earlier release already published are referenced, not uploaded again (buildManifest).
if (-not $NoPublish) {
  Invoke-Step 'publish' {
    $tag = "v$Version"
    Exec { gh release view $tag --repo $ReleasesRepo } | Out-Null
    if ($LASTEXITCODE -eq 0) { throw "$ReleasesRepo already has a release $tag. Bump the version." }

    $previousDir = Join-Path $outDir 'previous'
    New-Item -ItemType Directory -Path $previousDir -Force | Out-Null
    Exec { gh release download --repo $ReleasesRepo --pattern 'update.json' --dir $previousDir --clobber } | Out-Null
    $previous = Join-Path $previousDir 'update.json'
    if (-not (Test-Path $previous)) { Write-Output 'No earlier release: every component is uploaded.'; $previous = 'none' }

    $publishDir = Join-Path $outDir 'publish'
    Exec {
      & node (Join-Path $src 'scripts\release\sign-manifest.mjs') `
        --components (Join-Path $outDir 'components.json') --version $Version --notes-file $NotesFile `
        --previous $previous --base-url "https://github.com/$ReleasesRepo/releases/download/$tag" `
        --key $signingKey --out $publishDir
    }
    Assert-Exit 'Signing update.json (scripts/release/sign-manifest.mjs)'

    $assets = @((Join-Path $publishDir 'update.json'), (Join-Path $publishDir 'update.json.sig'))
    foreach ($name in (Get-Content (Join-Path $publishDir 'new-assets.txt') | Where-Object { $_ })) { $assets += (Join-Path $outDir $name) }
    Exec { gh release create $tag --repo $ReleasesRepo --latest --title $Version --notes-file $NotesFile @assets }
    Assert-Exit 'gh release create'
    Write-Output "Published $tag to $ReleasesRepo ($($assets.Count) assets)."

    if (-not $SkipTagPush) {
      Exec { git -C $sourceRepo tag $tag $commit }
      Assert-Exit "git tag $tag"
      Exec { git -C $sourceRepo push origin $tag }
      Assert-Exit "git push origin $tag"
    }
  }
}

# --- Summary ------------------------------------------------------------------------------------------
Write-Output ''
Write-Output "== Release $Version built in $outDir =="
foreach ($component in $components) { Write-Output ("   {0,-11} {1,-22} {2,8:N1} MB" -f $component.name, $component.version, ($component.size / 1MB)) }
Write-Output ''
$script:stepTimes | Format-Table Step, Time -AutoSize | Out-String | Write-Output
$total = ($script:stepTimes | Measure-Object Seconds -Sum).Sum
Write-Output ('Total: {0}m{1:00}s' -f [int][Math]::Floor($total / 60), ($total % 60))
} finally {
  Stop-Transcript | Out-Null
}
