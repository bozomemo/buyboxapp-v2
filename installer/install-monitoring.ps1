<#
  Doc 16 section 5 -- install Grafana Alloy and render its configuration.

  Runs after install-service.ps1. Three rules shape it, and none of them is cosmetic:

  1. IT NEVER FAILS THE INSTALLATION. Remote monitoring is an operational convenience; the
     product works without it. An operator who leaves the Grafana fields blank, or a machine
     with no internet during setup, must still finish with a working BuyBox. Every path here
     exits 0 and explains itself instead. This is the opposite of install-service.ps1, where a
     failure genuinely means the product is broken (doc 14 section 5 step 8).

  2. IT ONLY EVER ADDS WHAT IS MISSING, like configure-env.ps1. On an upgrade the wizard's
     fields come through empty, meaning "keep what is already configured". Rewriting them from
     blanks would silently disconnect a working installation, and nobody would notice until the
     day they went looking for a log that was never shipped.

  3. THE TOKEN IS NEVER WRITTEN WHERE ANOTHER USER CAN READ IT. Not into the rendered config,
     not into the registry via Alloy's /ENVIRONMENT flag, not into a machine environment
     variable -- all three are readable by every process on the box. It goes into its own file
     under the data directory with the same ACL .env.local gets: SYSTEM and Administrators only.
     Alloy runs as LocalSystem, so it can read it; the interactive user cannot.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [Parameter(Mandatory)] [string] $DataDir,
  [Parameter(Mandatory)] [int]    $Port,
  [string] $Instance = '',
  [string] $LokiUrl  = '',
  [string] $LokiUser = '',
  [string] $PromUrl  = '',
  [string] $PromUser = '',
  [string] $Token    = ''
)

$ErrorActionPreference = 'Stop'

$monitorDir   = Join-Path $DataDir 'monitoring'
$settingsPath = Join-Path $monitorDir 'settings.env'
$tokenPath    = Join-Path $monitorDir 'grafana-token.txt'
$configPath   = Join-Path $monitorDir 'config.alloy'
$templatePath = Join-Path $InstallDir 'monitoring\config.alloy.template'
$alloySetup   = Join-Path $InstallDir 'monitoring\alloy-installer.exe'

if (-not (Test-Path $monitorDir)) { New-Item -ItemType Directory -Path $monitorDir -Force | Out-Null }

# --- Lock a file down to SYSTEM and Administrators ------------------------------------------------
# Identical treatment to configure-env.ps1's handling of .env.local.
#
# Applied to the TOKEN ONLY, not to settings.env. The settings hold endpoint URLs and numeric
# account ids -- not secrets, and locking them bought nothing while adding a real failure mode:
# every later read of that file then needs elevation, and a read that throws in a script whose
# whole contract is "never fail the installation" is a bug waiting for the day someone runs it
# by hand. The token is the secret; it is the thing that gets protected.
function Protect-File([string] $Path) {
  $acl = Get-Acl $Path
  $acl.SetAccessRuleProtection($true, $false)
  $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
  foreach ($account in @('NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($account, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -Path $Path -AclObject $acl
}

# --- Merge: what was already configured, overridden by whatever the wizard supplied ---------------
$settings = [ordered]@{}
if (Test-Path $settingsPath) {
  try {
    foreach ($line in (Get-Content $settingsPath -ErrorAction Stop)) {
      $trimmed = $line.Trim()
      if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
      $match = [regex]::Match($trimmed, '^([A-Z0-9_]+)=(.*)$')
      if ($match.Success) { $settings[$match.Groups[1].Value] = $match.Groups[2].Value }
    }
  } catch {
    # The settings exist but cannot be read -- an ACL left over from an older install, or a file
    # held open by something. Stopping here, having changed nothing, is the only safe answer:
    # carrying on would rebuild the configuration from whatever the wizard supplied, and on an
    # upgrade that is a set of blanks. Alloy keeps running against the configuration it already
    # has, which is exactly the outcome rule 2 exists to protect.
    Write-Output "Mevcut izleme ayarlari okunamadi ($settingsPath): $($_.Exception.Message)"
    Write-Output 'Hicbir sey degistirilmedi; onceki izleme yapilandirmasi gecerli kalir.'
    exit 0
  }
}

foreach ($pair in @(
  @('INSTANCE',  $Instance),
  @('LOKI_URL',  $LokiUrl),
  @('LOKI_USER', $LokiUser),
  @('PROM_URL',  $PromUrl),
  @('PROM_USER', $PromUser)
)) {
  if (-not [string]::IsNullOrWhiteSpace($pair[1])) { $settings[$pair[0]] = $pair[1].Trim() }
}

# --- Normalise the two push URLs ------------------------------------------------------------------
# Grafana Cloud shows a bare host on some of its pages and a full push URL on others, so an
# operator copying in good faith can easily supply either. A bare host is not a usable endpoint:
# Alloy POSTs to the site root and Loki answers 405 Method Not Allowed, which it reports once as
# "dropping data" and then never mentions again -- an install that looks completely healthy while
# shipping nothing. Measured on the 0.1.10 install, 2026-09-08.
#
# Only a URL with no path of its own is completed. If the operator supplied any path, it is left
# exactly as given: guessing at a non-default one would be a worse failure than the one this
# prevents, because it would overwrite a deliberate choice.
function Complete-PushUrl([string] $Url, [string] $DefaultPath) {
  if ([string]::IsNullOrWhiteSpace($Url)) { return $Url }
  $trimmed = $Url.Trim()
  try {
    $uri = [System.Uri] $trimmed
  } catch {
    return $trimmed   # Not parseable; pass it through and let Alloy report it.
  }
  if ($uri.AbsolutePath -eq '/' -or $uri.AbsolutePath -eq '') {
    return $trimmed.TrimEnd('/') + $DefaultPath
  }
  return $trimmed
}

$settings['LOKI_URL'] = Complete-PushUrl $settings['LOKI_URL'] '/loki/api/v1/push'
$settings['PROM_URL'] = Complete-PushUrl $settings['PROM_URL'] '/api/prom/push'

# A blank instance on a first install is not worth stopping for -- the machine name is a better
# default than nothing, and it is what the operator would have typed anyway.
if ([string]::IsNullOrWhiteSpace($settings['INSTANCE'])) { $settings['INSTANCE'] = $env:COMPUTERNAME }

if (-not [string]::IsNullOrWhiteSpace($Token)) {
  # No trailing newline: local.file hands the file's bytes to basic_auth verbatim, and a stray
  # newline in the password produces a 401 that looks exactly like a wrong token.
  [System.IO.File]::WriteAllText($tokenPath, $Token.Trim())
  Protect-File $tokenPath
}

# --- Nothing configured? Say so and stop, successfully --------------------------------------------
$configured = (Test-Path $tokenPath) -and
              -not [string]::IsNullOrWhiteSpace($settings['LOKI_URL']) -and
              -not [string]::IsNullOrWhiteSpace($settings['PROM_URL'])

if (-not $configured) {
  Write-Output 'Uzaktan izleme yapilandirilmadi; bu adim atlandi. BuyBox normal calisiyor.'
  Write-Output 'Daha sonra kurmak icin: docs\16-remote-observability.md, bolum 5.'
  exit 0
}

$lines = foreach ($k in $settings.Keys) { "$k=$($settings[$k])" }
Set-Content -Path $settingsPath -Value $lines -Encoding ascii

# --- Render the configuration ---------------------------------------------------------------------
if (-not (Test-Path $templatePath)) {
  Write-Output "Alloy sablonu bulunamadi: $templatePath. Uzaktan izleme kurulmadi."
  exit 0
}

# Backslashes are doubled because they land inside Alloy string literals, where a single
# backslash is an escape character. C:\ProgramData\BuyBox written raw would make the config fail
# to parse, and Alloy would refuse to start with a message about the config rather than the path.
$dataDirEscaped  = $DataDir.Replace('\', '\\')
$tokenPathEscaped = $tokenPath.Replace('\', '\\')

$rendered = (Get-Content $templatePath -Raw -Encoding UTF8).
  Replace('{{TOKEN_FILE}}', $tokenPathEscaped).
  Replace('{{DATA_DIR}}',   $dataDirEscaped).
  Replace('{{INSTANCE}}',   $settings['INSTANCE']).
  Replace('{{PORT}}',       "$Port").
  Replace('{{LOKI_URL}}',   $settings['LOKI_URL']).
  Replace('{{LOKI_USER}}',  $settings['LOKI_USER']).
  Replace('{{PROM_URL}}',   $settings['PROM_URL']).
  Replace('{{PROM_USER}}',  $settings['PROM_USER'])

# Nothing may survive rendering. A placeholder added to the template without a matching Replace
# above would otherwise ship a config that Alloy either rejects at startup or, worse, accepts
# with a literal "{{INSTANCE}}" as a label value -- and the second failure is invisible until
# somebody wonders why the dashboard's machine selector has a strange entry in it.
$leftover = [regex]::Match($rendered, '\{\{[A-Z_]+\}\}')
if ($leftover.Success) {
  Write-Output "Alloy sablonunda doldurulmamis alan var: $($leftover.Value). Uzaktan izleme kurulmadi."
  exit 0
}

# WriteAllText with an explicit no-BOM UTF-8 encoder rather than Set-Content -Encoding utf8:
# Windows PowerShell 5.1 writes a BOM for "utf8", and Get-Content without -Encoding reads a
# BOM-less file as the system ANSI codepage. Between them the template's non-ASCII comment
# characters came back as mojibake in the rendered config -- harmless to Alloy, which only ever
# sees them inside comments, but the rendered file is something an operator reads.
[System.IO.File]::WriteAllText($configPath, $rendered, (New-Object System.Text.UTF8Encoding($false)))

# Lock the rendered config down as well as the token. ProgramData grants the interactive user
# write access by default, and config.alloy names the token file and the endpoints it is sent to:
# an unprivileged process could rewrite it to forward the token elsewhere, and Alloy would adopt
# that at its next restart. Protecting the token file alone would leave that door open. Nothing
# reads this file back except Alloy, which runs as LocalSystem, so locking it cannot reproduce
# the settings.env read failure that the comment above describes.
Protect-File $configPath

# --- Install or update the Alloy service -----------------------------------------------------------
# Everything below is best effort. A failed monitoring install leaves a working BuyBox, so it is
# reported and stepped over rather than thrown.
$service = Get-Service -Name 'Alloy' -ErrorAction SilentlyContinue

try {
  if (-not $service) {
    if (-not (Test-Path $alloySetup)) {
      Write-Output "Alloy kurulum dosyasi pakette yok: $alloySetup. Uzaktan izleme kurulmadi."
      exit 0
    }
    # /S silent, /CONFIG points at the rendered file under ProgramData -- deliberately not under
    # Program Files\BuyBox, which an upgrade empties wholesale (doc 14 section 5 step 3). Alloy
    # keeps running, and keeps shipping, straight through a BuyBox upgrade.
    $proc = Start-Process -FilePath $alloySetup -ArgumentList @('/S', "/CONFIG=$configPath") -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
      Write-Output "Alloy kurulumu basarisiz (cikis kodu $($proc.ExitCode)). Uzaktan izleme kurulmadi; BuyBox normal calisiyor."
      exit 0
    }
    $service = Get-Service -Name 'Alloy' -ErrorAction SilentlyContinue
  }

  if ($service) {
    # Alloy reloads its configuration on SIGHUP, which Windows has no equivalent of; a restart is
    # the supported way. It is also what picks up a config path change on an upgrade.
    Restart-Service -Name 'Alloy' -Force -ErrorAction Stop
    Write-Output "Uzaktan izleme kuruldu. Makine adi: $($settings['INSTANCE'])"
  } else {
    Write-Output 'Alloy servisi kurulumdan sonra bulunamadi. Uzaktan izleme etkin degil.'
  }
} catch {
  Write-Output "Uzaktan izleme kurulamadi: $($_.Exception.Message)"
  Write-Output 'BuyBox normal calisiyor. Ayrintilar icin docs\16-remote-observability.md.'
}

exit 0
