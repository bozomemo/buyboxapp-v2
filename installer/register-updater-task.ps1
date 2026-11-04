<#
  Registers the BuyBoxUpdater scheduled task (auto-update spec sections 3 and 8). Idempotent: the
  full installer runs it on every install and upgrade.

  The task has no trigger. It runs only when the app starts it (`schtasks /run`) after an admin
  pressed "Simdi kur", as SYSTEM, because replacing Program Files\BuyBox and restarting a service
  need it -- and the service cannot do either to itself while it is running.

  Its action first COPIES apply-update.ps1 out of {app}\scripts into ProgramData and runs the
  copy: the script replaces {app}\scripts, and must not be running from inside it.

  ASCII only (doc 14 section 8.4).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [Parameter(Mandatory)] [string] $DataDir
)

$ErrorActionPreference = 'Stop'

$updates = Join-Path $DataDir 'updates'
New-Item -ItemType Directory -Path $updates -Force | Out-Null

$source = Join-Path $InstallDir 'scripts\apply-update.ps1'
$copy = Join-Path $updates 'apply-update.ps1'
$command = "New-Item -ItemType Directory -Path '$updates' -Force | Out-Null; " +
  "Copy-Item -LiteralPath '$source' -Destination '$copy' -Force; " +
  "& '$copy' -InstallDir '$InstallDir' -DataDir '$DataDir'"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"$command`""
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew -StartWhenAvailable

Register-ScheduledTask -TaskName 'BuyBoxUpdater' -Action $action -Principal $principal -Settings $settings `
  -Description 'BuyBox guncellemesini kurar. Yalnizca uygulama icinden, yonetici onayiyla baslatilir.' -Force | Out-Null

Write-Output 'BuyBoxUpdater gorevi kaydedildi.'
