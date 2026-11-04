<#
  Kept so the old command still works. The build now lives in release.ps1, which builds outside
  OneDrive from a clean checkout, caches the components that do not change, and times every step
  (docs/superpowers/specs/2026-11-04-auto-update-design.md section 4).

  This wrapper builds the full installer and publishes nothing:
    powershell -ExecutionPolicy Bypass -File installer\build-package.ps1
#>
[CmdletBinding()]
param(
  [string] $Version,
  [string] $Ref,
  [switch] $SkipTests,
  [switch] $SkipSmokeTest
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'release.ps1') -NoPublish -FullInstaller @PSBoundParameters
exit $LASTEXITCODE
