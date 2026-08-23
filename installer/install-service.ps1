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
  & $winsw refresh
} else {
  & $winsw install
}
if ($LASTEXITCODE -ne 0) { throw "Servis kaydedilemedi (WinSW cikis kodu $LASTEXITCODE)." }

& $winsw start
if ($LASTEXITCODE -ne 0) { throw "Servis baslatilamadi (WinSW cikis kodu $LASTEXITCODE)." }

Write-Output 'BuyBoxApp servisi kuruldu ve baslatildi.'
