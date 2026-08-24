<#
  0.1.3'u installer\staging agacindan kurar.

  Smart App Control imzasiz BuyBoxSetup-0.1.3.exe'yi engelledigi icin exe atlaniyor. Payload
  ayni: buybox.iss'in [Files] bolumu bu bes klasoru oldugu gibi kopyalar, [Dirs] veri
  klasorlerini olusturur, [Run] bolumu de asagidaki uc scripti bu sirayla ve bu argumanlarla
  calistirir. Tek eksik: exe'nin kendisi, kaldirici ve kisayollar.
#>
$ErrorActionPreference = 'Stop'
$log = 'C:\ProgramData\BuyBox-staging-install.log'
Start-Transcript -Path $log -Force | Out-Null

$staging    = 'C:\Users\egeyu\OneDrive\Desktop\MEHMET\Personal\Code\BuyBoxAppV2\installer\staging'
$installDir = 'C:\Program Files\BuyBox'
$dataDir    = 'C:\ProgramData\BuyBox'
$port       = 3000
$version    = '0.1.3'

if (-not (Test-Path $staging)) { throw "staging bulunamadi: $staging" }

Write-Output '== 1) Onceki kurulum kalintisi =='
$svc = Get-Service BuyBoxApp -ErrorAction SilentlyContinue
if ($svc) { Write-Output "UYARI: BuyBoxApp servisi zaten var ($($svc.Status))" } else { Write-Output 'Servis yok - temiz.' }
foreach ($d in @($installDir, $dataDir)) {
  if (Test-Path $d) { Write-Output "UYARI: $d zaten var" } else { Write-Output "$d yok - temiz." }
}

Write-Output '== 2) Dosyalar kopyalaniyor ([Files]) =='
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
foreach ($name in @('app','node','chromium','scripts','service')) {
  $src = Join-Path $staging $name
  if (-not (Test-Path $src)) { throw "staging\$name yok" }
  Copy-Item $src (Join-Path $installDir $name) -Recurse -Force
  Write-Output "  $name kopyalandi"
}

Write-Output '== 3) Veri klasorleri ([Dirs]) =='
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dataDir 'logs') -Force | Out-Null

Write-Output '== 4) configure-env.ps1 =='
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installDir 'scripts\configure-env.ps1') -DataDir $dataDir -InstallDir $installDir
Write-Output "  exit=$LASTEXITCODE"

Write-Output '== 5) install-service.ps1 =='
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installDir 'scripts\install-service.ps1') -InstallDir $installDir -DataDir $dataDir -Port $port -Version $version
Write-Output "  exit=$LASTEXITCODE"

Write-Output '== 6) verify-health.ps1 =='
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installDir 'scripts\verify-health.ps1') -Port $port -DataDir $dataDir
Write-Output "  exit=$LASTEXITCODE"

Write-Output '== 7) Sonuc =='
Get-Service BuyBoxApp -ErrorAction SilentlyContinue | Format-List Name,Status,StartType | Out-String | Write-Output
Get-ChildItem $dataDir -Force | Select-Object Name,Length,LastWriteTime | Out-String | Write-Output
Write-Output '-- Program Files icinde yasak dosya taramasi --'
$leak = @()
foreach ($p in @('.env*','*.db','*.db-wal','*.db-shm','secrets.enc.json')) {
  $leak += Get-ChildItem $installDir -Recurse -Force -File -Filter $p -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $installDir 'app\data')) { $leak += Get-Item (Join-Path $installDir 'app\data') }
if ($leak) { $leak | ForEach-Object { Write-Output "SIZINTI: $($_.FullName)" } } else { Write-Output 'Temiz - sizinti yok.' }

Stop-Transcript | Out-Null
