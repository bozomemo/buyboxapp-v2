<#
  Doc 14 section 10 D-6 -- undo everything the install did outside its own directories.

  Three things now: the BuyBox service, the Grafana Alloy monitoring agent the install registered
  (doc 16 section 5), and the Windows Defender exclusion the install offered to add. An exclusion that outlives the product it was added for
  is a lasting change to the machine's security posture that nobody asked for and nobody will
  find later. Removing files is not enough; anything the installer wrote into Windows itself has
  to come back out.

  Tolerant on purpose: an uninstall must finish even if the service is already gone, already
  stopped, or wedged, and even if Defender is managed by policy and refuses. A half-uninstalled
  product that cannot be uninstalled again is the worst state to leave a machine in.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [string] $DataDir
)

$ErrorActionPreference = 'Continue'

# --- Service ------------------------------------------------------------------------------------
$winsw = Join-Path $InstallDir 'service\BuyBoxApp.exe'
if (Test-Path $winsw) {
  $service = Get-Service -Name 'BuyBoxApp' -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne 'Stopped') {
      & $winsw stop
      try { $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60)) } catch {}
    }
    & $winsw uninstall
  }
}

# --- Monitoring agent -----------------------------------------------------------------------------
# Alloy is a separate product in its own directory, but *we* put it there, so by the rule above it
# comes back out. Located through its own uninstall registry entry rather than a hard-coded path:
# a newer Alloy may install elsewhere, and the operator may have moved it.
#
# Entirely best effort. Alloy may have been installed by hand before BuyBox was, or be shared with
# something else on this machine, and removing BuyBox must never depend on removing it.
$alloyService = Get-Service -Name 'Alloy' -ErrorAction SilentlyContinue
if ($alloyService) {
  try {
    if ($alloyService.Status -ne 'Stopped') {
      Stop-Service -Name 'Alloy' -Force -ErrorAction Stop
    }
    $uninstallString = $null
    foreach ($key in @(
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Alloy',
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Alloy'
    )) {
      if (Test-Path $key) {
        $uninstallString = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).UninstallString
        if ($uninstallString) { break }
      }
    }
    if ($uninstallString) {
      Start-Process -FilePath $uninstallString.Trim('"') -ArgumentList '/S' -Wait -ErrorAction Stop
      Write-Output 'Grafana Alloy kaldirildi.'
    } else {
      Write-Output 'Grafana Alloy servisi durduruldu ama kaldirma kaydi bulunamadi; elle kaldirin.'
    }
  } catch {
    Write-Output "Grafana Alloy kaldirilamadi: $($_.Exception.Message). Elle kontrol edin."
  }
}

# --- Defender exclusion ---------------------------------------------------------------------------
if ($DataDir) {
  try {
    $current = (Get-MpPreference -ErrorAction Stop).ExclusionPath
    if ($current -and ($current -contains $DataDir)) {
      Remove-MpPreference -ExclusionPath $DataDir -ErrorAction Stop
      Write-Output "Defender istisnasi kaldirildi: $DataDir"
    }
  } catch {
    # Defender absent, replaced by another product, or managed by group policy. Not a reason to
    # fail an uninstall -- but say so, because it is the one leftover the operator may want to
    # clear by hand.
    Write-Output "Defender istisnasi kaldirilamadi ($DataDir). Elle kontrol edin: $($_.Exception.Message)"
  }
}

exit 0
