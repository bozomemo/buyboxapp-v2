# Handoff — self-update: release build and rehearsal (2026-11-05 → 2026-11-07)

Bu dosya, otomatik güncelleme (self-update) işinin nerede kaldığını başka bir bilgisayarda devam
edebilmek için özetler. Okuyucu: proje sahibi ve yeni bilgisayardaki Claude oturumu.

Spec: `docs/superpowers/specs/2026-11-04-auto-update-design.md` ·
Plan: `docs/superpowers/plans/2026-11-04-auto-update.md` ·
Build prosedürü: `installer/README-build.md` · Kabul kontrolleri: `docs/14-deployment.md` §10 (U-1…U-7)

---

## 1. Durum özeti

| Konu | Durum |
|---|---|
| Self-update kodu (0.2.0) | Bitti, `development`'a merge edildi ve push edildi |
| Release build | Çalışıyor, ~11–12 dk (eskiden saatler) |
| Gerçek releases reposu `bozomemo/buybox-releases` | Açıldı (public), **henüz hiç release yok** |
| Test reposu `bozomemo/buybox-releases-test` | Açıldı (public, "TEST ONLY"); v0.2.1 ve bozuk v0.2.2 yayında |
| Prova (boştaki kişisel PC) | U-1 ✅, U-2 ✅, U-7 ✅, U-3…U-6 açık |
| Prod (takipsistemi.arosiapet.com) | Dokunulmadı. 0.2.0 bir kez elle kurulmalı (installer prod'u silerek kurar — önce yedek) |

## 2. Product owner kararları (2026-11-05)

1. **DB test suite:** release build'lerde yalnız SQLite + PostgreSQL. MySQL katmanı build'i saatlerce
   uzatıyordu ve hiçbir kurulum MySQL'de çalışmıyor. CI ve normal `npm test` üç dialekti de koşar.
   Mekanizma: `BUYBOX_TEST_DIALECTS=sqlite,postgres` (`packages/db/src/test-helpers.ts`).
2. **Node sürümü:** paketlenen ve build'i yapan Node, sabit **v22.23.4**. `release.ps1` resmi taşınabilir
   zip'i indirir (hash kontrollü), `<build root>\cache\node-runtime` altına açar ve **sadece kendi
   process'inin PATH'ine** ekler. **Makinedeki Node'a dokunulmaz** (sahibin makinesinde v25 kalır;
   kaldırılmasını/değiştirilmesini istemiyor).
3. **Releases reposu:** şimdilik public, sadece imzalı artefaktlar (kaynak kod yok).

## 3. Bu oturumdaki commit'ler (`development`, hepsi push edildi)

| Commit | İçerik |
|---|---|
| `8f55b42` | Ayarlar: sekme çubuğu `settings-tabs`'a bölündü |
| `0b1643a` | Release build: sabit Node 22, DB suite SQLite + PostgreSQL |
| `4d1c480` | `to-be-added.txt` notları |
| `a83928b` | `release.ps1`: Windows `tar.exe` tam yoluyla (Git Bash'ten başlatınca GNU tar `C:` yolunu host sanıyordu) |
| `806181b` | `release.ps1`: `Exec` içindeki `$previous` yerel değişkeni yayın adımının `$previous`'unu gölgeliyordu → imzalama "Stop" adlı dosyayı arıyordu. İlk gerçek yayını kim yaparsa yapsın kırardı |

Push **edilmemiş**, yalnız eski PC'de duran: `rehearsal/broken-0.2.2` branch'i (commit `ac3b4ab`,
"REHEARSAL ONLY — never merge, never push"). Yeni PC'de gerekmez; v0.2.2 zaten yayında.

## 4. Ölçümler

- Tam build (`-NoPublish -FullInstaller`): **12 dk 01 sn**. Testler 8 dk 20 sn; bunun ~7,3 dk'sı DB paketi (501 test).
- 2.877 testin tamamı geçti; ABI kontrolü ve smoke test geçti.
- Bileşen boyutları: app 31,6 MB · node 31,7 MB · chromium 307,7 MB · runtime 7,4 MB · monitoring 101,9 MB.
- Artımlı yayın çalışıyor: v0.2.2 yayınında yalnız `app-0.2.2.zip` (33 MB) yüklendi; manifest diğer
  bileşenler için v0.2.1'deki dosyaları gösteriyor.
- Bileşen anahtarları (0.2.0/0.2.1/0.2.2 aynı): node `v22.23.4`, chromium `pw-1.62.1`,
  runtime `93fcf2afa027`, monitoring `aebf46d26db1`.

## 5. Prova sonuçları (boştaki kişisel PC, PostgreSQL ile kurulu)

Prova makinesinin `C:\ProgramData\BuyBox\.env.local` dosyasına eklenen satırlar:

```
UPDATE_MANIFEST_URL=https://github.com/bozomemo/buybox-releases-test/releases/latest/download/update.json
UPDATE_CHECK_INTERVAL=15m
```

> ⚠️ O makinede gerçek pazaryeri kimlik bilgisi yok ve olmamalı (prod ile çakışır).
> Prova bitince bu iki satır silinmeli ya da makine sıfırlanmalı.

| # | Sonuç |
|---|---|
| U-1 | ✅ 0.2.0 → 0.2.1 başarılı ("Başarılı 0.2.0 → 0.2.1") |
| U-2 | ✅ Bozuk 0.2.2 (no-op migration 0026 + yalnız gerçek kurulumda `degraded` health) kuruldu → 180 sn'de sağlıklı olmadı → **0.2.1'e geri dönüldü**, geçmişte "Geri dönüldü". 0.2.2'nin son health'inde `applied: 27` (migration çalıştı). Güncelleme boyunca `updateHold: true`, worker `update-hold` (fiyatlama durdu). Geri dönülen 0.2.2 tekrar önerilmiyor ("Güncel"). **Teyit edildi 2026-11-07:** `/api/health` → `version: 0.2.1`, `schema.applied: 26`/`expected: 26`, `drift: up-to-date`, `updateHold: false` — DB geri yüklendi |
| U-3 | Açık — `pg_dump.exe`'yi geçici olarak yeniden adlandır, sağlam bir 0.2.3 kur → "İptal edildi", eski sürüm çalışır, fiyatlama tutulmaz |
| U-4 | Açık — indirilen zip'te bir bayt değiştir, Kur → yeniden doğrulamada reddedilmeli |
| U-5 | Açık — güncelleme öncesi/sonrası `.env.local` karşılaştır (`PUBLIC_ORIGIN`/`TRUST_PROXY` korunmalı) |
| U-6 | Açık — ağ yokken yalnız son kontrol sonucu görünmeli |
| U-7 | ✅ 2026-11-07: yalnız `app` değiştiren 0.2.2 için `updates\0.2.2\` içinde sadece `app.zip` (33.182.172 bayt) + `update.json`/`.sig` var; node/chromium/runtime/monitoring indirilmedi. (Başarılı 0.2.1 klasörü kurulumdan sonra temizlenmiş.) |

Test repoda sıradaki sürüm **0.2.3** olmalı (sağlam; U-3 için).

## 6. Ertelenen düzeltmeler (prova bitince)

Bunlar `runtime` bileşeninin anahtarını değiştirir; prova sırasında yapılırsa U-7 ölçümü bozulur.

1. `installer/apply-update.ps1`: `tar.exe` → `$env:SystemRoot\System32\tar.exe` (release.ps1 `a83928b` ile aynı).
2. `installer/apply-update.ps1`: `Exec` içindeki `$previous` → çakışmayan bir ad (release.ps1 `806181b` ile aynı). Şu an zararsız, ama aynı tuzak.
3. **Güncelleme geçmişi metni (UX):** geri dönüş nedeni ASCII Türkçe ("saglikli olmadi") ve ham health JSON'u
   olarak gösteriliyor. Ekranda kısa düzgün Türkçe özet; ham JSON yalnız log'da.
4. **"Geri dönüldü 0.2.1 → 0.2.2" yanıltıcı:** "0.2.2 denendi, 0.2.1'e geri dönüldü" gibi yazılmalı.

## 7. Yeni bilgisayarda devam etmek için

### Git'te OLMAYAN, elle taşınması gerekenler

| Ne | Nerede (eski PC) | Not |
|---|---|---|
| **Release imza anahtarı** | `%USERPROFILE%\.buybox\release-signing-key.pem` | **Gizli.** USB ile taşı, buluta/git'e koyma. Yoksa yayın yapılamaz. Offline yedeği de alınmalı. Açık anahtar `packages/shared/src/release/public-key.ts` |
| Alloy installer | `installer\vendor\alloy-installer-windows-amd64.exe` (109 MB) | GitHub'ın 100 MB sınırı yüzünden commit'li değil; bkz. `installer/vendor/README.md` |
| (İsteğe bağlı) 0.2.0 installer | `C:\BuyBoxBuild\out\0.2.0\BuyBoxSetup-0.2.0.exe` | Prod'a ilk elle kurulum için; yeni PC'de yeniden build de alınabilir |

`WinSW.exe` commit'li. Build önbelleği (`C:\BuyBoxBuild`) taşınmaz; ilk build Node indirir ve `npm ci` koşar.

### Yeni PC'de gerekenler

- Git, Docker Desktop (PostgreSQL test container'ı), Inno Setup 6 (`winget install JRSoftware.InnoSetup`).
- Node: yalnız günlük araçlar için, sürüm fark etmez (build kendi Node 22'sini indirir).
- Repo **OneDrive dışında olabilir**; build zaten `C:\BuyBoxBuild` altında çalışır.
- GitHub: `gh` CLI giriş yapmamış olabilir. Eski PC'de token Git Credential Manager'dan alındı
  (birden fazla hesap var; **bozomemo** seçilmeli):

  ```bash
  export GH_TOKEN=$(printf 'protocol=https\nhost=github.com\nusername=bozomemo\n\n' | git credential fill | sed -n 's/^password=//p')
  ```

  Ya da bir kez `gh auth login`.

### Kullanılan komutlar

```powershell
# Deneme build'i (yayınsız, tam installer ile)
powershell -ExecutionPolicy Bypass -File installer\release.ps1 -NoPublish -FullInstaller

# Test reposuna yayın (kaynakta sürüm değişmez, tag atılmaz)
powershell -ExecutionPolicy Bypass -File installer\release.ps1 -Version 0.2.3 `
  -ReleasesRepo bozomemo/buybox-releases-test -SkipTagPush -NotesFile <notlar.md>

# Belirli bir commit/branch'ten build
... -Ref <commit veya branch>
```

Yayın testsiz yapılamaz (`-SkipTests`/`-SkipSmokeTest` ile yayın reddedilir); temiz olmayan çalışma
ağacı da reddedilir (`-Ref` verilmediyse).

## 8. Sıradaki adımlar

1. ~~Prova PC'de `/api/health` → `applied` = 26 teyidi (U-2'yi kapatır) ve `updates\` klasörü (U-7).~~ Bitti 2026-11-07.
2. Sağlam 0.2.3'ü test reposuna yayınla → U-3, U-4, U-5, U-6.
3. §6'daki düzeltmeler; commit + push.
4. Prova makinesindeki test ayarlarını temizle.
5. Prod: yedek al → 0.2.0'ı (veya o güne kadarki sürümü) **gerçek** repodan sonra butonla güncellenecek
   şekilde bir kez elle kur. Installer prod'u silerek kurar; zamanı birlikte planlanmalı.
6. İlk gerçek yayın: `release.ps1` (varsayılan repo `bozomemo/buybox-releases`, tag push açık).

## 9. Temizlik (eski PC, isteğe bağlı)

- `C:\BuyBoxBuild2` (3,1 GB): eski commit'ten, Node v25 ile alınmış 0.2.0 — **kullanılmamalı**. Silinecekse
  `git worktree remove --force C:/BuyBoxBuild2/src` sonra klasörü sil.
- `.claude/worktrees/auto-update`: `feat/auto-update` merge edildiği için gereksiz.
- Scratchpad'deki `broken-022` worktree'si ve `rehearsal/broken-0.2.2` branch'i: prova bitince silinebilir.
