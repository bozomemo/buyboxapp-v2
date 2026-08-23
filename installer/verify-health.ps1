<#
  Doc 14 section 5 step 8 -- the install is not finished until the service answers.

  An installer that reports success over a service that never started is worse than one that
  fails: the failure surfaces later, to someone who no longer has the installation in front of
  them. So a service that does not answer within the timeout fails the installation and names
  the log file.

  `/api/health` returns 200 even with no database configured (doc 14 section 5.1) -- a fresh install
  legitimately has none until the wizard runs. What is being verified here is that the process
  is up and serving, not that it is fully set up.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [int]    $Port,
  [Parameter(Mandatory)] [string] $DataDir,
  [int] $TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'

$url = "http://127.0.0.1:$Port/api/health"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      Write-Output "Servis yanit veriyor: $url"
      exit 0
    }
  } catch {
    # Not up yet. The service is still booting, or it has already died -- the loop cannot tell
    # the difference, and the deadline below decides.
  }
  Start-Sleep -Seconds 2
}

$logPath = Join-Path $DataDir 'logs\BuyBoxApp.err.log'
Write-Output "Servis $TimeoutSeconds saniye icinde yanit vermedi ($url)."
Write-Output "Ayrinti icin gunluk dosyasi: $logPath"
exit 1
