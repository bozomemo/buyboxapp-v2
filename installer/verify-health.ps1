<#
  Doc 14 section 5 step 8 -- the install is not finished until the service answers *healthily*.

  An installer that reports success over a broken service is worse than one that fails: the
  failure surfaces later, to someone who no longer has the installation in front of them. That
  is not hypothetical. The first real install, 2026-08-24, passed this check and then returned
  500 on every page, because this script asked only whether an HTTP response arrived --
  and `/api/health` answers 200 while degraded, by design (doc 14 section 5.1).

  So it now requires `status: ok`, which means the database is reachable and its schema matches
  the build. On a packaged install the installer has already written DATABASE_URL and the
  service migrates at boot, so `ok` is the correct expectation, not an optimistic one.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [int]    $Port,
  [Parameter(Mandatory)] [string] $DataDir,
  [int] $TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'

$url = "http://127.0.0.1:$Port/api/health"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$lastSeen = '(hic yanit alinamadi)'

while ((Get-Date) -lt $deadline) {
  try {
    $body = Invoke-RestMethod -Uri $url -TimeoutSec 5
    if ($body.status -eq 'ok') {
      Write-Output "Servis calisiyor: $url"
      exit 0
    }
    # Reached but not ready: still booting, or migrating. Keep the reason for the failure
    # message -- "degraded, database unreachable" is a far better report than "no answer".
    $lastSeen = ($body | ConvertTo-Json -Compress -Depth 6)
  } catch {
    $lastSeen = $_.Exception.Message
  }
  Start-Sleep -Seconds 3
}

$logPath = Join-Path $DataDir 'logs\BuyBoxApp.err.log'
Write-Output "Servis $TimeoutSeconds saniye icinde calisir duruma gelmedi ($url)."
Write-Output "Son durum: $lastSeen"
Write-Output "Ayrinti icin gunluk dosyasi: $logPath"
exit 1
