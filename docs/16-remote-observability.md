# 16 — Uzaktan izleme (Grafana Cloud)

Kayıtları ve metrikleri makineye uzak masaüstü ile bağlanmadan görebilmek için.

Bu doküman `docs/14-deployment.md` §5'i tamamlar: orada kayıtların **nereye yazıldığı**
anlatılır, burada onların **nasıl uzaktan görüldüğü**.

---

## 1. Neden bir ajan, neden uygulamanın kendisi değil

Uygulama `127.0.0.1` üzerinde ve kimlik doğrulaması olmadan dinler (doc 14 §4.4). Bu bilinçli bir
karardır ve bu doküman onu değiştirmez. Dolayısıyla uzaktan görünürlük tek bir şekilde
sağlanabilir: veriyi **dışarı iten** bir ajanla. İçeri açılan hiçbir port yoktur.

Ajan (Grafana Alloy) BuyBoxApp'ten **ayrı bir Windows servisi** olarak çalışır. Üç nedeni var ve
üçü de ayrı ayrı önemlidir:

| Neden | Sonuç |
|---|---|
| Uygulama çöktüğünde ajan çalışmaya devam eder | Çökme anında yazılan satırlar — yani asıl açıklayıcı olanlar — kaybolmaz. Uygulama içi bir HTTP log taşıyıcısı tam da bunları kaybeder |
| Ajan uygulamayı yavaşlatamaz veya başarısız edemez | Ağ takılması ajanın sorunudur. Fiyatlandırma yolu hiçbir zaman Grafana Cloud'u beklemez |
| Kayıtlar için uygulamada **hiçbir kod değişikliği gerekmez** | `packages/shared/src/logger.ts` zaten satır başına bir JSON nesnesi yazıyor, WinSW zaten dosyaya alıyor. Ajan sadece okuyor |

Metrikler için tek bir yeni uç nokta eklendi (§3). Kayıtlar için hiçbir şey eklenmedi.

**Mevcut hiçbir şey kaldırılmadı.** Dosya kayıtları yerinde duruyor ve internet kesildiğinde tek
kayıt kaynağı odur; `/events` ekranı yerinde duruyor. Grafana bunların yerine değil, yanına
gelir.

---

## 2. Neyin gönderildiği, neyin gönderilmediği

| Gönderilen | Kaynak | Kod değişikliği |
|---|---|---|
| Uygulama kayıtları (JSON satırları) | `ProgramData\BuyBox\logs\*.log` | Yok |
| İş / kuyruk / devre kesici / bütçe metrikleri | `/api/metrics` (yeni) | Var, §3 |
| Makine sağlığı (CPU, disk, RAM, servis durumu) | Windows exporter | Yok |

**Gönderilmeyen:**

- **`app_events` tablosunun satırları.** Ürün sahibinin kararı (2026-09-08): dosya kayıtları
  aynı bilginin çoğunu zaten taşıyor ve `/events` ekranı yerelde duruyor. Metrik olarak sadece
  *sayıları* ve *son hatanın zamanı* gönderilir; satırın kendisi veritabanında kalır.
- **Hiçbir fiyat, hiçbir para değeri.** Bu bir kural, tercih değil — §3.2.
- **Hiçbir kimlik bilgisi.** Logger zaten adı kimlik bilgisi söyleyen alanları `[redacted]` ile
  değiştiriyor (`packages/shared/src/logger.ts`), ve bu satırlar oraya ulaşmadan önce olur.

---

## 3. `/api/metrics`

Yeni uç nokta: `apps/web/src/app/api/metrics/route.ts`. Prometheus metin formatı döner.

Aritmetiğin tamamı `apps/web/src/lib/server/metrics.ts` içindedir ve **saftır** — veritabanı yok,
saat yok, I/O yok; `renderMetrics(snapshot, nowMs)` bir anlık görüntüyü metne çevirir. Bu ayrım
tablo tabanlı testleri mümkün kılar (`metrics.test.ts`, 31 test). Okuma tarafı
`packages/db/src/repositories/metrics.ts` içindedir ve **sadece okur, hiç toplamaz**.

Yanlış bir metrik, eksik bir metrikten kötüdür — çünkü ona göre karar verilir. Aritmetiğin
ayrıca test edilmesinin sebebi budur.

### 3.1 Yayınlanan metrikler

| Metrik | Tür | Anlamı |
|---|---|---|
| `buybox_up` | gauge | Süreç bu isteği yanıtladı. Her zaman 1 |
| `buybox_database_up` | gauge | Veritabanı okunabildi mi. `buybox_up`'tan **ayrı**: ölü servis ile ölü veritabanı farklı müdahale ister |
| `buybox_database_schema_up_to_date` | gauge | Şema bu sürümle uyuşuyor mu |
| `buybox_process_uptime_seconds` | gauge | Sıfıra düşmesi = servis yeniden başladı |
| `buybox_worker_running` | gauge | Bu süreçte worker döngüsü var mı |
| `buybox_worker_last_tick_seconds` | gauge | Son tick'ten bu yana. Tick'ler ~2 sn arayla; 60 sn üstü = döngü durdu |
| `buybox_job_runs_total{job,state}` | gauge | Son bir saatte başlayan çalışmalar |
| `buybox_job_items_total{job,outcome}` | gauge | İşlenen kalemler. "Başarılı" bir çalışmanın 500 kalemden 400'ünde hata alması bu satırda görünür |
| `buybox_job_run_duration_seconds` | histogram | p50/p95/p99 için. Kova sınırları bu uygulamanın gerçek iş sürelerine göre seçildi |
| `buybox_job_runs_running{job}` | gauge | **Zaman penceresiyle sınırlı değil** — saatlerdir takılı bir çalışma görünür kalmalı |
| `buybox_job_queue_depth{state}` | gauge | `job_queue` satır sayıları |
| `buybox_job_queue_oldest_due_seconds` | gauge | Vadesi geçmiş en eski işin yaşı. Derinlik tek başına "meşgul" ile "durmuş"u ayıramaz; bu ayırır |
| `buybox_app_events_total{level}` | gauge | Son bir saatteki olay sayıları |
| `buybox_app_events_last_problem_seconds` | gauge | Son warn/error'dan bu yana. Pencere temizse **hiç yayınlanmaz** |
| `buybox_circuit_breaker_state{marketplace,state}` | gauge | Durum başına 0/1 |
| `buybox_circuit_breaker_consecutive_failures{marketplace}` | gauge | Ardışık hata sayısı |
| `buybox_circuit_breaker_open_seconds{marketplace}` | gauge | Sadece devre gerçekten açıkken |
| `buybox_update_budget_consumed{marketplace}` | gauge | Bugün kullanılan güncelleme çağrısı. Para değil, **çağrı sayısı** |
| `buybox_update_budget_allowance{marketplace}` | gauge | Bugünkü limit |

### 3.2 Uç noktanın uyduğu kurallar

Üçü de bir dışa aktarıcı yazan biri tarafından en az bir kez çiğnenmiş kurallardır:

1. **Etiket kardinalitesi sınırlıdır.** Her etiket değeri kapalı bir kümedendir: iş adı,
   pazaryeri kodu, durum enum'u, kova sınırı. Bir ilan kimliği veya stok kodu etiket olsaydı
   seri sayısı katalog büyüklüğüyle çarpılırdı — ücretsiz katmanı tüketmenin yolu budur.
2. **Asla para yayınlanmaz.** Para bu kod tabanında `bigint` kuruştur; bir Prometheus örneği ise
   IEEE-754 double'dır. Sessizce yuvarlanmayacak bir gösterim yoktur, dolayısıyla fiyatlar hiç
   yayınlanmaz. Fiyat *değişikliği sayısı* sorun değildir; fiyatın kendisi veritabanında kalır.
3. **Yokluk sıfır değildir.** Veritabanı okunamıyorsa `buybox_database_up 0` yazılır ve iş
   metriklerinin **hiçbiri** yayınlanmaz. Güven veren bir sıfır tabanı, sakin ve sağlıklı bir
   geceyle birebir aynı görünür.

### 3.3 Lisans kapısı

`/api/metrics`, `/api/health` gibi lisans kapısından muaftır (`apps/web/src/proxy.ts`). Sebep
health'inkinden daha keskindir: lisansın dolduğu an, makinenin ne yaptığını görmenin en çok
gerektiği andır. Oradan 402 dönmek tam o anda bütün panoları karartırdı. **Kötü haber geldiğinde
kendini kapatan izleme, hiç izleme olmamasından kötüdür** — çünkü ona güvenilir.

---

## 4. Grafana Cloud hesabı (senin yapacakların)

1. <https://grafana.com/auth/sign-up/create-user> adresinden ücretsiz hesap aç. Kredi kartı
   istemez.
2. Bir "stack" oluştur. Bölge olarak Avrupa'yı seç — gecikme için değil, veri yerleşimi için.
3. Stack sayfasında şu dört değeri not et:
   - **Loki**: *Send Logs* bölümündeki URL ve **User** (sayısal).
   - **Prometheus**: *Send Metrics* bölümündeki URL ve **User** (sayısal).
4. **Access Policy Token** oluştur: *Administration → Users and access → Access policies →
   Create access policy*. Kapsam olarak yalnızca `logs:write` ve `metrics:write` ver.
   `logs:read` verme — bu makinedeki jetonun okuma yetkisi olmasına gerek yok, ve
   sızarsa yazma yetkisi okuma yetkisinden çok daha az zararlıdır.
   Token yalnızca bir kez gösterilir.

Ücretsiz katman: 50 GB kayıt, 10 000 metrik serisi, 14 gün saklama. §7'deki tahmine göre bu
kurulum bunun çok altında kalır.

---

## 5. Alloy kurulumu — kurulum paketinin içinde

Alloy **kurulum paketiyle birlikte gelir** ve sihirbaz tarafından sessizce kurulur. Ayrıca bir
şey indirmen, kopyalaman veya ortam değişkeni ayarlaman gerekmez.

Bu, doc 14 §3'teki kararla aynı karardır: *"Kurulum programı hiçbir şey aramaz ve başka hiçbir
şey kurmaz."* Operatörden GitHub'dan bir dosya indirmesini istemek, tam olarak o dokümanın
reddettiği türden bir adımdır.

### 5.1 Paket üzerindeki etkisi

| | |
|---|---|
| `installer\vendor\alloy-installer-windows-amd64.exe` | ~109 MB, WinSW gibi vendor edilir |
| Derlenmiş kuruluma etkisi | **+101 MB** — 0.1.10 derlemesinde ölçüldü: 279 MB → **385 MB**. Alloy'un kurulum dosyası zaten sıkıştırılmış olduğu için LZMA2 neredeyse hiçbir şey kazandırmıyor |
| Alloy binary'si eksikse | Derleme **başarısız olmaz**, yalnızca uyarı verir. Paket normal çalışan bir ürün kurar, sadece uzaktan izleme olmaz |

Son satır bilinçlidir ve WinSW'den ayrıldığı nokta budur: WinSW'siz paket hiç çalışmaz, Alloy'suz
paket eksiksiz çalışan bir üründür. Fiyatlandırmayı test eden bir geliştirici derlemesini 109
MB'lık bir dosyaya bağımlı kılmanın anlamı yok.

### 5.2 Sihirbazdaki sayfa

Bağlantı noktası sayfasından sonra **"Uzaktan izleme (isteğe bağlı)"** sayfası gelir. Altı alan
vardır: makine adı, Loki URL, Loki kullanıcı no, Prometheus URL, Prometheus kullanıcı no ve
erişim jetonu.

**Hepsi isteğe bağlıdır ve doğrulanmaz.** Boş bırakırsan BuyBox normal kurulur; uzaktan izleme
etkin olmaz ve bunu sana söyler. Bağlantı noktası sayfasının aksine burada *yanlış cevap yoktur* —
cevap vermemek de dahil.

**Yükseltmede boş bırakmak, mevcut ayarları korur.** `install-monitoring.ps1`,
`configure-env.ps1` ile aynı kuralı uygular: yalnızca eksik olanı ekler, var olanı asla
üzerine yazmaz. Boşlarla yeniden yazmak, çalışan bir kurulumu sessizce koparırdı ve bunu ancak
aylar sonra, aradığın bir kaydın hiç gönderilmemiş olduğunu fark ettiğinde anlardın.

### 5.3 Jetonun nerede durduğu

**Jeton hiçbir zaman ortam değişkenine veya kayıt defterine yazılmaz.** İkisi de makinedeki her
kullanıcı tarafından okunabilir. Alloy'un kendi `/ENVIRONMENT=` kurulum bayrağı jetonu
`HKLM\Software\GrafanaLabs\Alloy` altına koyar — bu yüzden kullanılmıyor.

Bunun yerine:

| Dosya | İçerik | Erişim |
|---|---|---|
| `ProgramData\BuyBox\monitoring\grafana-token.txt` | yalnızca jeton | SYSTEM + Administrators |
| `ProgramData\BuyBox\monitoring\settings.env` | URL'ler, kullanıcı no'ları, makine adı | SYSTEM + Administrators |
| `ProgramData\BuyBox\monitoring\config.alloy` | şablondan üretilmiş yapılandırma | varsayılan |

`.env.local` ile birebir aynı korumadır (`configure-env.ps1`). Alloy servisi LocalSystem olarak
çalışır, dolayısıyla okuyabilir; oturum açmış kullanıcı okuyamaz.

Yapılandırma `local.file` bileşeniyle jetonu okur ve dosyayı **izler** — yani jetonu değiştirmek
tek bir dosya yazma işlemidir; servisi yeniden başlatmak gerekmez ve gönderimde boşluk oluşmaz.

### 5.4 Alloy nereye kurulur ve neden oraya

Kendi dizinine (`C:\Program Files\GrafanaLabs\Alloy`), **`Program Files\BuyBox` içine değil.**

Sebep yükseltmedir: BuyBox yükseltmesi `{app}` ağacını olduğu gibi boşaltır (doc 14 §5 adım 3).
Alloy o ağacın dışında olduğu için yükseltme sırasında **çalışmaya ve göndermeye devam eder** —
yani bir yükseltmeyi panodan izleyebilirsin. Bu, tam da izlemek isteyeceğin andır.

Üretilen yapılandırma da aynı nedenle `ProgramData\BuyBox\monitoring\` altındadır.

### 5.5 Kaldırma

`uninstall-service.ps1` Alloy'u da kaldırır — kendi kaldırma kaydı üzerinden bulur. Kural doc 14
§10 D-6'daki kuraldır: kurulum programı Windows'a ne yazdıysa geri çıkarır.

Tamamen "best effort": Alloy elle, BuyBox'tan önce kurulmuş olabilir veya makinede başka bir şeyle
paylaşılıyor olabilir. BuyBox'ı kaldırmak, Alloy'u kaldırabilmeye asla bağlı değildir.

### 5.6 Elle kurulum (geliştirme makinesi)

Kurulum programını çalıştırmadan denemek için, aynı betiği doğrudan çağır:

```powershell
# Yönetici olarak
.\installer\install-monitoring.ps1 `
  -InstallDir 'C:\Program Files\BuyBox' `
  -DataDir 'C:\ProgramData\BuyBox' `
  -Port 3000 `
  -Instance 'ofis-pc' `
  -LokiUrl 'https://logs-prod-eu-west-0.grafana.net/loki/api/v1/push' `
  -LokiUser '123456' `
  -PromUrl 'https://prometheus-prod-01-eu-west-0.grafana.net/api/prom/push' `
  -PromUser '654321' `
  -Token 'glc_...'
```

Alloy'un kendi arayüzü `http://127.0.0.1:12345` adresindedir (yalnızca yerel); her bileşenin
sağlıklı olup olmadığını orada görürsün. Yapılandırmayı ayrıca doğrulamak için:

```powershell
& 'C:\Program Files\GrafanaLabs\Alloy\alloy.exe' validate 'C:\ProgramData\BuyBox\monitoring\config.alloy'
```

## 6. Panolar

`monitoring/grafana/buybox-overview.json` → Grafana'da *Dashboards → New → Import → Upload JSON*.
İçe aktarırken iki veri kaynağı sorar (Prometheus ve Loki); stack'inin varsayılanlarını seç.

Paneller bir arıza gerçekte nasıl okunuyorsa o sırayla dizilmiştir: **ayakta mı → çalışıyor mu →
ne bozuldu → suç makinede mi.**

Birden fazla makine varsa panonun üstündeki **Makine** açılır listesi hangisine baktığını
seçer. `instance` etiketi her iki tarafta da (kayıtlar ve metrikler) aynı değeri taşır — Windows
exporter'ın kendi `instance` etiketi `discovery.relabel` ile ezilir, çünkü `external_labels`
zaten etiketi olan serilere uygulanmaz ve bu fark yalnızca "panelde neden veri yok" olarak
görünürdü.

Log arama örnekleri (Explore → Loki):

```logql
{job="buybox"} | json | level="error"
{job="buybox"} | json | correlationId="<bir iş çalışmasının kimliği>"
{job="buybox", stream="stderr"} |= "Trendyol"
```

`correlationId` bir **etiket değil alan**'dır — bilinçli olarak. Etiket yapılsaydı her iş
çalışması ayrı bir Loki akışı olurdu; alan olarak sorgu anında yine tam olarak aranabilir.

---

## 7. Maliyet ve sınırlar

| | Tahmin | Ücretsiz katman |
|---|---|---|
| Kayıt hacmi | Günde ~50–200 MB, `LOG_LEVEL`'a bağlı | 50 GB/ay |
| Metrik serisi | ~200–400 (iş sayısı × durum + makine) | 10 000 |
| Saklama | — | Kayıt 14 gün, metrik 13 ay |

Metrik saklama süresinin kayıttan uzun olması işine yarar: "bu iş eskiden ne kadar sürüyordu"
sorusu aylar sonra da yanıtlanabilir, ama ham satırlar iki hafta sonra yalnızca yerel dosyalarda
kalır. Yerel dosyalar 30 dosya boyunca tutulur (doc 14 §5 adım 7), yani **iki kaynağın erişim
mesafesi farklıdır ve bu bilinçlidir.**

Ücretsiz katmanı aşmanın en kolay yolu bir etiketi yanlış seçmektir. `monitoring/alloy/config.alloy`
içindeki `stage.labels` bloğuna yeni bir alan eklemeden önce şunu sor: bu alanın kaç farklı değeri
olabilir? Yanıt "ilan sayısı kadar" ise etiket olmamalıdır.

---

## 8. Uyarılar

Bu turda **kurulmadı** — ürün sahibinin kararı (2026-09-08): önce hangi sinyallerin gerçekten
önemli olduğu görülsün, uyarılar ondan sonra yazılsın. Yanlış kurulmuş bir uyarı, birkaç yanlış
alarmdan sonra görmezden gelinmeye başlanır ve o noktadan sonra hiç olmamasından kötüdür.

Sırası geldiğinde ilk adaylar, hepsi hâlihazırda yayınlanan metriklerden:

- `buybox_worker_last_tick_seconds > 120` — worker döngüsü durdu.
- `buybox_job_queue_oldest_due_seconds > 3600` — zamanlayıcı iş almayı bıraktı.
- `buybox_circuit_breaker_state{state="open"} == 1` — bir pazaryeri kapandı.
- `absent(buybox_up)` — servis veya ajan tamamen sustu. Diğer hepsinin sessiz kaldığı durum
  budur, dolayısıyla yazılacak ilk uyarı muhtemelen bu olmalıdır.

---

## 9. Linux

Bugün Linux'ta çalışan bir kurulum **yok**. Doc 14 §11 Docker Compose'u "sunucu işleten, teknik
personeli olan bir müşteri için makul bir üçüncü seçenek" olarak anar ve birincil yol olmadığını
açıkça söyler. Bu bölüm, ileride gerekirse neyin değişeceğini şimdiden yazılı bırakır.

**Taşınabilir olan (hiçbir değişiklik gerekmez):**

- `/api/metrics` — düz Node, işletim sistemine bağlı hiçbir şey yok.
- Metrik SQL'i — zaten üç lehçe.
- Panonun "Makine" satırı dışındaki her paneli.

**Değişmesi gereken üç şey**, `monitoring/alloy/config.linux.alloy` içinde yazılı — **denenmemiş**
olarak işaretli:

1. **Tail edilecek log dosyası yoktur.** Asıl fark budur, bir yol değişikliği değil. Windows'ta
   WinSW stdout/stderr'i dosyaya alır ve Alloy onu okur. Linux'ta bunu yapan bir şey yoktur:
   süreç stdout'a yazar, init sistemi yakalar — systemd altında journald, Docker altında log
   sürücüsü. Dolayısıyla log **kaynağı** değişir; dosyada iki seçenek de var, biri silinip diğeri
   kullanılacak.
2. `prometheus.exporter.windows` → `prometheus.exporter.unix`. Metrik adları da değişir
   (`windows_cpu_time_total` → `node_cpu_seconds_total`), yani panonun üç "Makine" paneli
   güncellenir.
3. Jeton dosyasının korunması: Windows ACL yerine alloy kullanıcısına ait `chmod 600`.

---

## 10. Doğrulama durumu (2026-09-08)

| Parça | Durum |
|---|---|
| `renderMetrics` aritmetiği ve çıktı biçimi | **31 test, geçiyor** |
| Metrik SQL'i — SQLite, PostgreSQL, MySQL | **24 test, üçü de geçiyor.** Konteynerler: `docker compose -f packages/db/docker-compose.test.yml up -d`, sonra `npx vitest run src/repositories/metrics.test.ts --no-file-parallelism` |
| Alloy yapılandırma şablonu | Sözdizimi güncel Alloy dokümanlarına karşı doğrulandı; `alloy validate` **çalıştırılmadı** (Alloy bu makinede kurulu değil) |
| `install-monitoring.ps1` | ASCII temiz, ayrıştırıcı kabul ediyor. **Dört senaryo gerçek dosyalarla çalıştırıldı:** (1) hiç yapılandırılmamış → atlar, (2) ilk yapılandırma → dosyaları yazar ve şablonu doldurur, (3) yükseltmede tüm alanlar boş → mevcut ayarları korur, (4) yalnızca makine adı değişir → birleştirir. Jeton dosyasının kilidi normal kullanıcı için doğrulandı (okuma reddedildi); üretilen yapılandırmada jeton açık metin olarak geçmiyor. **Alloy'un kendi kurulumu çalıştırılmadı** (binary yok) |
| `buybox.iss` değişiklikleri | **Derlenmedi.** Inno Setup bu makinede kurulu değil; `build-package.ps1` bir derlemede doğrular |
| Kurulum paketi (Alloy dahil) | **Derlenmedi.** `installer\vendor\alloy-installer-windows-amd64.exe` henüz indirilmedi |
| Pano JSON'u | Geçerli JSON; Grafana'ya içe aktarılarak **denenmedi** |
| Linux yapılandırması | **Tamamen denenmedi.** Çalışan bir Linux kurulumu yok |
| Uçtan uca akış | **Denenmedi** — Grafana Cloud hesabı gerekiyor |

### Sıradaki adımlar

1. Grafana Cloud hesabını aç (§4) ve `installer\vendor\` içine Alloy indiricisini koy (§5.1).
2. `install-monitoring.ps1`'i elle çalıştır (§5.6) — kurulum paketini derlemeden önce akışın
   çalıştığını görmek en ucuz doğrulamadır.
3. Panoyu içe aktar (§6) ve verinin geldiğini gör.
4. Ancak ondan sonra paketi derle ve yükseltme yolunu dene.
