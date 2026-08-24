<#
  Doc 14 section 10 D-6 -- undo everything the install did outside its own directories.

  Two things, and the second was missing until 2026-08-24: the service, and the Windows Defender
  exclusion the install offered to add. An exclusion that outlives the product it was added for
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
