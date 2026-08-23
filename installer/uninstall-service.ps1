<#
  Doc 14 section 10 D-6 -- stop and deregister the service on uninstall.

  Tolerant on purpose: an uninstall must finish even if the service is already gone, already
  stopped, or wedged. A half-uninstalled product that cannot be uninstalled again is the worst
  state to leave a customer's machine in.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir
)

$ErrorActionPreference = 'Continue'

$winsw = Join-Path $InstallDir 'service\BuyBoxApp.exe'
if (-not (Test-Path $winsw)) { exit 0 }

$service = Get-Service -Name 'BuyBoxApp' -ErrorAction SilentlyContinue
if ($service) {
  if ($service.Status -ne 'Stopped') {
    & $winsw stop
    try { $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60)) } catch {}
  }
  & $winsw uninstall
}

exit 0
