<#
  Registers the BuyBoxUpdater scheduled task (auto-update spec sections 3 and 8). Idempotent: the
  full installer runs it on every install and upgrade.

  The task has no trigger. It runs only when the app starts it (`schtasks /run`) after an admin
  pressed "Simdi kur", as SYSTEM, because replacing Program Files\BuyBox and restarting a service
  need it -- and the service cannot do either to itself while it is running.

  Nothing it runs or trusts is read from ProgramData (review C1, 2026-11-05). ProgramData lets
  every local user create files, and whoever creates a file owns it: an updater that ran a script
  or extracted an archive from there would run a standard user's code as SYSTEM. So the action
  copies apply-update.ps1 from {app}\scripts into {app}\.updater -- Program Files, which users
  cannot write -- and runs that copy, never the one in {app}\scripts, which it replaces. The copy
  fails closed: if it cannot be made, nothing runs.

  It also locks down {DataDir}\updates and {DataDir}\backups to SYSTEM and Administrators. The
  first holds what the updater acts on; the second holds pre-update database dumps, which must
  not be readable by every user of the machine.

  ASCII only (doc 14 section 8.4).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $InstallDir,
  [Parameter(Mandatory)] [string] $DataDir
)

$ErrorActionPreference = 'Stop'

# SYSTEM and Administrators, by SID so a localised Windows resolves them. Inheritance from
# ProgramData is cut, so the Users "create files" right does not reach in; anything already inside
# -- including a file a user planted before this ran -- is reset to the new ACL and re-owned.
function Protect-AdminOnly {
  param([Parameter(Mandatory)] [string] $Path)
  New-Item -ItemType Directory -Path $Path -Force | Out-Null
  & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls could not protect $Path (exit $LASTEXITCODE)." }
  & icacls.exe $Path /setowner '*S-1-5-32-544' /T /C /Q | Out-Null
  if (Get-ChildItem $Path -Force) {
    & icacls.exe (Join-Path $Path '*') /reset /T /C /Q | Out-Null
  }
}

Protect-AdminOnly (Join-Path $DataDir 'updates')
Protect-AdminOnly (Join-Path $DataDir 'backups')

# Single quotes inside a path are doubled for the single-quoted strings in the command below.
function Quote([string] $Value) { "'" + $Value.Replace("'", "''") + "'" }

$source = Join-Path $InstallDir 'scripts\apply-update.ps1'
$runDir = Join-Path $InstallDir '.updater'
$copy = Join-Path $runDir 'apply-update.ps1'
$command = "`$ErrorActionPreference = 'Stop'; " +
  "New-Item -ItemType Directory -Path $(Quote $runDir) -Force | Out-Null; " +
  "Copy-Item -LiteralPath $(Quote $source) -Destination $(Quote $copy) -Force; " +
  "& $(Quote $copy) -InstallDir $(Quote $InstallDir) -DataDir $(Quote $DataDir)"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"$command`""
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# 30 minutes: an update that takes longer has hung. Shorter than the 45 minutes after which the
# app and the script treat its lock and request as stale (UPDATE_STALE_MS).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew -StartWhenAvailable

Register-ScheduledTask -TaskName 'BuyBoxUpdater' -Action $action -Principal $principal -Settings $settings `
  -Description 'BuyBox guncellemesini kurar. Yalnizca uygulama icinden, yonetici onayiyla baslatilir.' -Force | Out-Null

Write-Output 'BuyBoxUpdater gorevi kaydedildi.'
