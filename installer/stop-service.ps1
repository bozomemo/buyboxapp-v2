<#
  Doc 14 section 5 step 3 -- stop the running service before a single file under {app} is
  replaced.

  On an upgrade the previous version is running out of the directory the wizard is about to
  overwrite: node.exe, the WinSW executable and the whole Chromium payload are all held open by
  it, and Windows will not let Inno replace a file that is. Without this the second install on a
  machine fails with "file in use" or defers the copy to a reboot, which leaves the service
  running old code against a database the new build has already migrated.

  Stopping through the SCM (rather than `BuyBoxApp.exe stop`) is deliberate: it is the same path
  Windows itself uses at shutdown, so WinSW performs its normal graceful stop -- the scheduler
  stops claiming, in-flight work finishes and the scheduler lock is released -- and it does not
  depend on the old installation's files still being where we expect them.

  Exit code 0 = safe to proceed; anything else stops the installation. A machine with no service
  registered is a fresh install and is not an error.

  ASCII only (see build-package.ps1): Windows PowerShell 5.1 mis-reads anything else.
#>
[CmdletBinding()]
param(
  [string] $InstallDir,
  # WinSW's own stoptimeout is 45s (BuyBoxApp.xml.template). This has to outlast it, or we would
  # report a failure at the moment the service was about to stop on its own.
  [int] $TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'

$service = Get-Service -Name 'BuyBoxApp' -ErrorAction SilentlyContinue
if (-not $service) {
  # A fresh install, or one whose service was removed by hand. Not an error, and not a reason to
  # skip the check below either: an unregistered service can still have left a node.exe running.
  Write-Output 'BuyBoxApp servisi kayitli degil.'
} elseif ($service.Status -ne 'Stopped') {
  Write-Output 'Calisan BuyBox servisi durduruluyor...'
  try {
    Stop-Service -Name 'BuyBoxApp' -Force -ErrorAction Stop
  } catch {
    # Not fatal on its own: the service may already be in StopPending, in which case the wait
    # below is what decides whether it actually stopped.
    Write-Output "Servis durdurma istegi hata verdi: $($_.Exception.Message)"
  }

  try {
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds($TimeoutSeconds))
  } catch {
    Write-Output 'BuyBox servisi durdurulamadi.'
    Write-Output "  Servis $TimeoutSeconds saniye icinde durmadi (son durum: $($service.Status))."
    Write-Output '  Hizmetler (services.msc) uzerinden BuyBox servisini durdurup kurulumu tekrar baslatin.'
    exit 1
  }
}

# A stopped service is not the same as released file handles: WinSW returns to Stopped as soon as
# its child has been asked to go away, and node.exe can outlive that by a moment -- long enough
# for the file copy that follows to fail. Wait for anything still running out of the install
# directory to actually exit.
if ($InstallDir) {
  $prefix = $InstallDir.TrimEnd('\') + '\'
  $deadline = (Get-Date).AddSeconds(30)
  $holders = @()
  while ((Get-Date) -lt $deadline) {
    $holders = @(Get-Process -ErrorAction SilentlyContinue |
      Where-Object {
        try { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) }
        catch { $false }
      })
    if ($holders.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }

  if ($holders.Count -gt 0) {
    $names = ($holders | ForEach-Object { $_.ProcessName } | Sort-Object -Unique) -join ', '
    Write-Output 'Kurulum klasorunde hala calisan surecler var.'
    Write-Output "  Surecler: $names"
    Write-Output '  Bu surecleri kapatip kurulumu tekrar baslatin.'
    exit 1
  }
}

# Neutral on purpose: this line is reached whether a service was stopped, was already
# stopped, or was never registered.
Write-Output 'Kurulum klasoru serbest; kuruluma devam edilebilir.'
exit 0
