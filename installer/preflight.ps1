<#
  Doc 14 section 5 step 1 -- refuse an install that cannot work, before anything is written.

  Every message is Turkish and names what is wrong, because the person reading it is the
  customer, not us. Exit code 0 = proceed; anything else stops the installer.

  It deliberately checks nothing about Node, Chromium or a database: those ship inside the
  package (doc 14 section 3), so there is nothing to find and nothing to fail on.
#>
[CmdletBinding()]
param(
  [int] $RequiredFreeMb = 1500
)

$ErrorActionPreference = 'Stop'
$problems = @()

# --- 64-bit Windows 10 1809 (build 17763) or newer -------------------------------------------
$os = Get-CimInstance Win32_OperatingSystem
$build = [int] (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber

if ($os.OSArchitecture -notmatch '64') {
  $problems += 'Bu uygulama yalnizca 64-bit Windows uzerinde calisir.'
}
if ($build -lt 17763) {
  $problems += "Windows 10 surum 1809 (yapi 17763) veya daha yenisi gerekiyor. Bu makine: yapi $build."
}

# --- Administrator ---------------------------------------------------------------------------
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $problems += 'Kurulum yonetici olarak calistirilmali. Kurulum dosyasina sag tiklayip "Yonetici olarak calistir" secin.'
}

# --- Disk space on the system drive ------------------------------------------------------------
$systemDrive = $env:SystemDrive.TrimEnd(':')
$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($systemDrive):'"
$freeMb = [math]::Floor($drive.FreeSpace / 1MB)
if ($freeMb -lt $RequiredFreeMb) {
  $problems += "Yetersiz disk alani: $($systemDrive): surucusunde $freeMb MB bos yer var, en az $RequiredFreeMb MB gerekiyor."
}

if ($problems.Count -gt 0) {
  Write-Output 'Kurulum baslatilamiyor:'
  foreach ($p in $problems) { Write-Output "  - $p" }
  exit 1
}

Write-Output 'Sistem kontrolleri tamam.'
exit 0
