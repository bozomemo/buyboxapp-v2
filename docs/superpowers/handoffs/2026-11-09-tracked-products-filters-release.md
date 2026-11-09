# Handoff — Takip Edilen Ürünler filtreleri ve 0.2.4–0.2.6 sürümleri (2026-11-08 → 2026-11-09)

Bu dosya, `/tracked-products` iyileştirmesinin ve sürüm yayınının nerede kaldığını özetler.
Okuyucu: proje sahibi ve repo taşındıktan sonra açılacak yeni Claude oturumu.

Spec: `docs/superpowers/specs/2026-11-08-tracked-products-filters-design.md` ·
Plan: `docs/superpowers/plans/2026-11-08-tracked-products-filters.md` ·
Önceki handoff (self-update, release build): `docs/superpowers/handoffs/2026-11-07-auto-update-rehearsal.md`

---

## 1. Durum özeti

| Konu | Durum |
|---|---|
| Özellik kodu (sıralama, satıcı filtreleri, sade üst bölüm) | Bitti, `development`'a commit edildi, push edildi |
| Hız düzeltmeleri | İki tur: `666bad1` (son bakış sorgusu), `fe83993` (fiyat bandı) |
| Test reposu `bozomemo/buybox-releases-test` | v0.2.4, v0.2.5, v0.2.6 yayında (0.2.6: 2026-11-09, testler + smoke geçti) |
| Gerçek repo `bozomemo/buybox-releases` | **Hâlâ hiç release yok.** 0.2.4 denemesi yayından önce durduruldu |
| Bu PC'deki kurulum | 0.2.5, PostgreSQL, şema 27/27, worker çalışıyor |
| Kaynak repoda sürüm etiketi | Yok. Test yayınları `-SkipTagPush` ile yapıldı; `v0.2.x` etiketi atılmadı |

## 2. Yapılan özellik (0.2.4)

- Liste varsayılan olarak değerlendirme sayısına göre (çoktan aza) sıralanır.
- Satıcısı olmayan ürünler varsayılan olarak gizli. Diğer › Satıcısızları göster: Hayır / Dahil / Sadece.
  Henüz taranmamış ürünler görünmeye devam eder. Marka ekranındaki linkler `includeNoSeller=true` taşır.
- Satıcı filtresi: yazarak aranabilen liste (`SearchableSelect`), son 30 günde satan satıcı.
- Satıcı ≥ filtresi: son 30 günde en az N farklı satıcı.
- Satıcı sütunu: son 30 günün farklı satıcı sayısı. Sıralanabilir, Excel'e aktarılır.
  Dönem Satıcı sütunu kaldırıldı.
- Üst bölüm (layout A): tek filtre şeridi, Diğer ve Kayıtlı açılır menüleri (`PopoverButton`),
  başlıkta "+ Link ile ekle", tarama ilerlemesi özet satırında çip olarak.
- Yeni tablo `tracked_product_sellers` (migration 0026, üç dialekt). Her başarılı bakışta yazılır,
  çünkü gözlem arşivi sadece değişimde yazıyor ve 30 günlük sayım onunla yanlış çıkar.
  Migration geçmiş gözlemlerden bir kez doldurur.
- Dokümanlar: `docs/05-data-model.md`, `docs/06-user-interface.md` §12.2, `docs/15-ui-redesign-plan.md` 2.2.

## 3. Bu iş boyunca commit'ler (`development`, hepsi push edildi)

| Commit | İçerik |
|---|---|
| `161f4e0` | Özellik: satıcı filtreleri, değerlendirme sırası, kompakt başlık |
| `fca11ea` | DB testleri: tracked product sellers testlerine 30 sn süre |
| `666bad1` | perf(db): son bakış, satır başı korelasyonlu `max` yerine gruplu `max` |
| `fe83993` | perf: liste sayfası sadece fiyat bandını okur (`trackedProductPriceBands`) |

## 4. Hız ölçümleri (bu PC, gerçek veri, PostgreSQL, ~6.650 ürün)

Hedef (spec): 200 satır < 300 ms, 50 satır < 150 ms. Tarayıcıdan `fetch` ile ölçüldü.

| İstek | 0.2.4 | 0.2.5 | 0.2.6 |
|---|---|---|---|
| 200 satır (varsayılan) | 1,2–1,8 sn | 450–820 ms | ölçülmedi |
| 50 satır | ~370 ms | ~175 ms | ölçülmedi |
| 200 satır, Satıcı ≥ 3 | 1,3 sn | 770 ms | ölçülmedi |
| 200 satır, satıcı sayısına göre sıralı | 2,9 sn | — | ölçülmedi |
| Satıcı listesi (`/api/tracked-products/sellers`) | 203 ms | — | — |

Bulunan nedenler (`EXPLAIN ANALYZE`, `buybox` veritabanı):

1. **Son bakış sorgusu** (`latestTrackedProductObservationsFor`): korelasyonlu `max(observed_at)`
   sayfanın ~12.000 gözlem satırının her biri için yeniden çalışıyordu, 830 ms. Gruplu `max` +
   satır değeri `in`: 47 ms. `666bad1` ile düzeldi, 0.2.5'te.
2. **Dönem istatistiği** (`trackedProductPeriodStats`): iki `count(distinct …)` metin sıralaması
   yapıyor. Veritabanı `tr-TR` collation ile kurulu, bu sıralama ~250 ms. Sayfa sadece min/max
   fiyat kullanıyor. Yeni `trackedProductPriceBands`: ~40 ms. `fe83993` ile düzeldi, 0.2.6'da.
3. **Açık kalan:** satıcı sayısına göre sıralama, korelasyonlu `count`'u 6.500 ürünün hepsi
   için hesaplıyor, sorgu tek başına ~355 ms. Varsayılan sıralama değil. Ayrı iyileştirme olarak
   bırakıldı (gruplu `left join` ile çözülebilir).

Diğer sorgular hızlı: ana liste ~36–65 ms, sayım ~8 ms, kart linkleri < 1 ms.

## 5. Kaldığı yer ve sıradaki adımlar

1. **0.2.6 test deposu derlemesi.** Arka planda başlatıldı (commit `fe83993`). Log:
   `%LOCALAPPDATA%\Temp\claude\...\scratchpad\release-test-0.2.6.log` (geçici klasör, kalıcı değil).
   Bittiyse https://github.com/bozomemo/buybox-releases-test/releases/tag/v0.2.6 görünür.
   Bitmediyse ya da yarıda kaldıysa aynı komutu yeniden çalıştır (§7). Aynı sürüm numarası test
   reposunda zaten varsa script durur; o zaman numarayı artır.
2. Bu PC'yi güncelleme ekranından 0.2.6'ya güncelle.
3. Hızı tekrar ölç: `/tracked-products` açıkken tarayıcı konsolunda `fetch('/api/tracked-products?limit=200')`
   süresi. Hedef < 300 ms.
4. İyiyse **gerçek repoya** yayınla: `-ReleasesRepo` vermeden, `-SkipTagPush` olmadan (§7).
   Gerçek repo boş olduğu için ilk sürüm bütün bileşenleri yükler (~900 MB), kaynak repoya
   `v0.2.6` etiketi atılır. Mağaza kurulumu güncellemeyi bu repodan görür.
5. Sonra (isteğe bağlı): satıcı sayısına göre sıralamayı hızlandır; aşağıdaki ertelenenler.

## 6. Ertelenen / bilinen

- `packages/jobs` içindeki `confirm-submissions.test.ts` makine yüklüyken 5 sn sınırını aşıp bir
  kez düştü (release denemesi 1). Tek başına 3 kez geçti. Diğer DB testleri gibi 30 sn süre verilebilir.
- `.superpowers/` klasörü `.gitignore`'da değil (git status'ta `??` görünür).
- MySQL dialektinde yeni sorgular test edilmedi (makinede MySQL yok). CI üç dialekti koşar.
- İnceleme sonrası küçük notlar: spec/plan dosyalarında.

## 7. Komutlar

Sistem Node'u (22.3.0) eski. BuyBox'ın Node'u ile çalıştır:

```bash
N="/c/Program Files/BuyBox/node/node.exe"
"$N" node_modules/typescript/bin/tsc -b tsconfig.json
"$N" node_modules/vitest/vitest.mjs run <dosya>
```

PostgreSQL ile DB testleri (admin URL dosyadan okunur, ekrana basılmaz):

```bash
POSTGRES_ADMIN_URL=$(tr -d '\r\n' < "$USERPROFILE/.buybox/test-postgres-admin-url.txt") BUYBOX_TEST_DIALECTS=sqlite,postgres "$N" ../../node_modules/vitest/vitest.mjs run <dosya>
```

Release (PowerShell, repo kökünden). Notlar dosyası geçici klasördeydi; içerik aşağıda §8.

```powershell
$env:POSTGRES_ADMIN_URL = (Get-Content "$env:USERPROFILE\.buybox\test-postgres-admin-url.txt" -Raw).Trim()
# test reposu:
.\installer\release.ps1 -Version 0.2.6 -Ref fe83993 -NotesFile notes.txt -ReleasesRepo bozomemo/buybox-releases-test -SkipTagPush
# gerçek repo:
.\installer\release.ps1 -Version 0.2.6 -Ref fe83993 -NotesFile notes.txt
```

Release ~27 dk sürer (testler ~20 dk). Build `C:\BuyBoxBuild` altında olur. Alloy bileşeni kaynak
repodaki `installer\vendor` klasöründen alınır.

Veritabanına doğrudan bakmak: `C:\Program Files\PostgreSQL\16\bin\psql.exe`. Windows psql'inde
seçenekler bağlantı adresinden **önce** yazılmalı, `-w` şifre sormayı kapatır:

```bash
U=$(tr -d '\r\n' < "$USERPROFILE/.buybox/test-postgres-admin-url.txt"); "/c/Program Files/PostgreSQL/16/bin/psql.exe" -w -At -c "select 1" -d "${U%/*}/buybox" < /dev/null
```

## 8. Sürüm notu (0.2.6, Türkçe)

```
BuyBox 0.2.6

Takip Edilen Ürünler
- Liste varsayılan olarak değerlendirme sayısına göre (en çoktan aza) sıralanır.
- Satıcısı olmayan ürünler varsayılan olarak gizlenir; Diğer › Satıcısızları göster ile görülebilir (Dahil / Sadece). Henüz taranmamış ürünler görünmeye devam eder.
- Yeni Satıcı filtresi: yazarak aranabilen liste; seçilen satıcının son 30 günde sattığı ürünleri gösterir.
- Yeni Satıcı ≥ filtresi: son 30 günde en az N farklı satıcısı olan ürünler.
- Satıcı sütunu artık son 30 günün farklı satıcı sayısını gösterir, sıralanabilir ve Excel'e aktarılır. Dönem Satıcı sütunu kaldırıldı.
- Ekranın üst bölümü sadeleşti: tek filtre şeridi, Diğer ve Kayıtlı açılır menüleri, başlıkta "+ Link ile ekle", tarama ilerlemesi özet satırında.
- 200 satırlık sayfa çok daha hızlı yüklenir.

Veritabanı: yeni tablo tracked_product_sellers (migration 0026). İlk açılışta geçmiş taramalardan bir kez doldurulur.
```

## 9. Repoyu D:'den C:'ye taşırken

- **Önce 0.2.6 derlemesinin bitmesini bekle.** Build, Alloy bileşenini kaynak repodaki
  `installer\vendor`'dan okur; yarıda taşınırsa derleme bozulur.
- `node_modules` içindeki workspace bağlantıları (junction) eski yolu gösterebilir. Taşıdıktan
  sonra yeni yerde `npm ci --ignore-scripts` çalıştır (BuyBox Node'u ile:
  `"$N" "/c/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" ci --ignore-scripts`), sonra
  `tsc -b tsconfig.json`.
- Git'e girmeyenler: `installer\vendor` (Alloy), `.superpowers/`. Klasörü bütün olarak taşırsan
  bunlar da gider.
- Claude'un proje hafızası klasör yoluna bağlı
  (`%USERPROFILE%\.claude\projects\D--MEHMET-buyboxappv2-buyboxapp-v2\`). Yeni yolda yeni oturum
  bu hafızayı görmez; gerekirse `memory` klasörünü yeni yolun proje klasörüne kopyala.
- Kurulu uygulama (`C:\Program Files\BuyBox`, `C:\ProgramData\BuyBox`) repodan bağımsız; taşımadan
  etkilenmez.
