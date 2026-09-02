<#
  Doc 14 section 5 step 7 -- render the WinSW definition and register the service.

  Idempotent: on an upgrade the service already exists, so it is stopped and its definition
  rewritten rather than reinstalled. Uninstalling and reinstalling would drop the failure-action
  configuration and, on some machines, leave a "marked for deletion" service that the next start
  cannot use.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [Parameter(Mandatory)] [string] $DataDir,
  [Parameter(Mandatory)] [int]    $Port,
  [Parameter(Mandatory)] [string] $Version
)

$ErrorActionPreference = 'Stop'

$serviceDir = Join-Path $InstallDir 'service'
$winsw = Join-Path $serviceDir 'BuyBoxApp.exe'
$template = Join-Path $serviceDir 'BuyBoxApp.xml.template'
$configPath = Join-Path $serviceDir 'BuyBoxApp.xml'

foreach ($dir in @($DataDir, (Join-Path $DataDir 'logs'))) {
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

(Get-Content $template -Raw).
  Replace('{{INSTALL_DIR}}', $InstallDir).
  Replace('{{DATA_DIR}}', $DataDir).
  Replace('{{PORT}}', "$Port").
  Replace('{{VERSION}}', $Version) |
  Set-Content -Path $configPath -Encoding utf8

$existing = Get-Service -Name 'BuyBoxApp' -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -ne 'Stopped') {
    & $winsw stop
    $existing.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
  }
  # `refresh` is a WinSW 3.x command. The vendored binary is 2.12.0 (see the vendor README), where
  # it does not exist, and calling it is a FATAL "Unknown command: refresh" -- which threw out of
  # this script before the start below and left the upgraded service stopped. Measured on a
  # customer machine 2026-09-01; the wizard reported success anyway, see buybox.iss.
  #
  # On 2.x there is nothing to do here. Everything the service *runs* -- executable, arguments,
  # working directory, every env entry, the log configuration and the stop timeout -- is read out
  # of BuyBoxApp.xml at each start, and that file has just been rewritten above. Only the
  # registration-time properties (start mode, failure actions, description) need a command, and
  # those are what a plain XML rewrite cannot reach; they have not changed since 0.1.0, and a
  # template change to one of them would need an uninstall/install rather than this branch.
  #
  # Probed rather than pinned, so bumping the vendored binary to 3.x starts using `refresh` again
  # without a second edit here.
  $supportsRefresh = $false
  try {
    $supportsRefresh = ((& $winsw help | Out-String) -match '(?m)^\s+refresh\b')
  } catch {
    # A `help` that cannot run tells us nothing. Treat it as "no refresh" and carry on.
  }
  if ($supportsRefresh) {
    & $winsw refresh
    if ($LASTEXITCODE -ne 0) { throw "Servis tanimi guncellenemedi (WinSW cikis kodu $LASTEXITCODE)." }
  } else {
    Write-Output 'Bu WinSW surumunde refresh yok; servis tanimi yalnizca XML uzerinden guncellendi.'
  }
} else {
  & $winsw install
  if ($LASTEXITCODE -ne 0) { throw "Servis kaydedilemedi (WinSW cikis kodu $LASTEXITCODE)." }
}

& $winsw start
if ($LASTEXITCODE -ne 0) { throw "Servis baslatilamadi (WinSW cikis kodu $LASTEXITCODE)." }

Write-Output 'BuyBoxApp servisi kuruldu ve baslatildi.'
