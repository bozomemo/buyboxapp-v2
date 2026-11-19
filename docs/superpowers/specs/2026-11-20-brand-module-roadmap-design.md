# Marka modülü: yeni özellikler — beyin fırtınası ve tasarım

Tarih: 2026-11-20. Durum: **öneri** — ürün sahibinin okuması ve seçmesi için. Hiçbiri henüz
spesifikasyon değil; seçilenler doc 17'ye taşınır ve doc 12'de bir faza bağlanır.

Kapsam: `/brand/*`, `/watched-brands/*`, `/tracked-products` ekranları ve onları besleyen işler
(doc 17, doc 06 §12.4, doc 05 §5). Satış modülüne dokunan hiçbir öneri yok.

---

## 0. Kısa özet

Marka modülü bugün dört soruyu iyi cevaplıyor: **markamı kim satıyor, kaça satıyor, bandımın
dışında mı, satmaya yetkisi var mı?** Eksik olan üç şey var:

1. **Ne yapacağım?** Bulgu ve alarm üretiyoruz, ama bir ihlalin sonrasını (ihtar, takip,
   tekrar) izleyen bir yer yok. Marka sorumlusunun asıl işi o kısım.
2. **Genel durum nasıl?** Her şey satır satır doğru, ama "bu hafta markam nasıldı" sorusunun
   tek ekranlık cevabı yok. Yöneticiye gidecek özet de yok.
3. **Ne değişti?** Arşiv zaman serisi tutuyor (fiyat, buybox, satıcı, değerlendirme), ama
   ekranlar çoğunlukla "şu an"ı gösteriyor. Trend, tekrar, süre gibi soruların cevabı arşivde
   duruyor ve okunmuyor.

Önerilen ilk on (gerekçe ve tasarım §6'da):

| # | Özellik | Neden | Emek |
|---|---------|-------|------|
| 1 | **Marka Panosu** — tek ekranda bugün | Güne başlarken "nereye bakmalıyım" | Orta |
| 2 | **Vaka ve İhtar Dosyası** | İhlal → ihtar → takip → tekrar zinciri; kanıt paketi | Büyük |
| 3 | **Haftalık özet e-postası** | Ekrana bakmayan yöneticiye ulaşmak | Orta |
| 4 | **Zararına satış uyarısı** | Bayi maliyetinin altına satan = şüpheli tedarik; veri zaten var | Küçük |
| 5 | **Kupon / raf fiyatı ayrımı** | "Kupon ile ihlal" ile "raf fiyatıyla ihlal" farklı konuşmalar | Küçük |
| 6 | **Satıcı Uyum Karnesi** | Bayileri sıralamak, ödül/ceza kararı | Orta |
| 7 | **Fiyat uyum zaman çizelgesi** | "Son 30 günde bandın içinde kaldığı süre %" | Orta |
| 8 | **Kampanya takvimi / geçici bant** | Planlı kampanyada sahte alarm yağmasın, plansız indirim yakalansın | Orta |
| 9 | **Raf ve stok uyarıları** | Ürün rafta yok / yalnız yetkisiz satıcıda / stok bitiyor | Küçük |
| 10 | **Eşleşmemiş kart kuyruğu** | Markanın altında görünen ama hiçbir ürüne bağlı olmayan kartlar | Küçük |

İlk dalga (4, 5, 9, 10) **yeni veri toplamadan**, bugün saklanan veriden çıkar.

---

## 1. Bugün modül ne yapıyor

| Alan | Ekran | Ne söylüyor |
|------|-------|-------------|
| Ürünler | Stok, ürün ayrıntısı | PSF, min/max bant, birim fiyat, desi; kart bağlantıları ve çarpan |
| İzleme | İlanlar | Bağlı ve yıldızlı kartlarda buybox satıcısı, fiyat, bant durumu, tahmini satıcı kârı |
| Alarm | Alarmlar | Buybox sahibi bandın dışında; açık / kapanmış ihlaller; bildirim |
| Katalog | İzlenen Markalar, Takip Edilen Ürünler | Markanın pazaryerindeki tüm kartları, değerlendirme, satıcı sayısı |
| Satıcılar | Marka Satıcıları, Satıcı ayrıntısı, Satıcı Politikası | Kim satıyor, buybox payı, piyasa sapması; yetkili / yasaklı / tanımsız; firma kimliği |
| Denetim | Denetim Bulguları | Yasaklı satıcı, PSF altı, sistematik fiyat kırma, yeni satıcı, alakasız kategori… |
| Karşılaştırma | Pazaryeri Eşleşmesi, Marka Karşılaştırması | Aynı ürün iki pazaryerinde; rakip marka fiyat endeksi |

**Elimizdeki veri** (doc 05 §5) — önerilerin tamamı buna dayanır:

- Her **bakışta** her teklif için: sıra (buybox = 1), satıcı kimliği, raf fiyatı (`price`), kupon
  sonrası fiyat (`final_price`), stok (`offered_stock`), satıcı puanı, promosyon var/yok ve metni.
  Değişiklik olunca saklanır; seri tam olarak geri kurulabilir. 90 gün tutulur.
- Ürün düzeyinde: değerlendirme sayısı ve ortalaması **zaman serisi**
  (`tracked_product_metrics`), kategori, satıcısı var mı / en son ne zaman vardı, her satıcının
  ilk ve son görüldüğü tarih (`tracked_product_sellers`), barkod (yalnız Hepsiburada).
- Markanın kendisi: PSF, bant, birim fiyat, desi, komisyon tarifesi, satıcı politikası, firma
  kimliği (vergi no), ihlal geçmişi.

**Elimizde olmayan ve olamayacak veri:** satış adedi (değerlendirme hızı tek vekildir), arama
sıralaması (yeni bir kaynak gerekir, §7), Trendyol'da barkod, satıcının teslim süresi (birimi
belirsiz olduğu için bilerek eşlenmiyor).

---

## 2. Kimler kullanıyor

Aynı kurulumu farklı kişiler, farklı sorularla açıyor. Kurulumu yapan müşteri bir **marka
distribütörü** (doc 17 §8): bayilere ürün satıyor, bayiler pazaryerinde satıyor.

| Kişi | Ne zaman açar | Cevap aradığı soru | Bugün cevaplanıyor mu |
|------|---------------|--------------------|------------------------|
| **Marka / ürün müdürü** | Her sabah, alarm gelince | "Hangi ürünümde fiyat bozuldu, kim bozdu, ne zamandır?" | Kısmen: Alarmlar ve İlanlar var; süre, tekrar ve trend yok |
| **Kanal / bayi sorumlusu** | Haftada bir, bayi görüşmesinden önce | "Bu bayi kurallara uyuyor mu, ne kadar satıyor, geçen ay ne yaptı?" | Kısmen: satıcı ayrıntısı var; uyum puanı ve geçmiş özeti yok |
| **Hukuk / uyum** | İhtar yazılacağında | "Kanıtım ne: hangi ürün, hangi fiyat, hangi gün, hangi sayfa?" | Hayır: kanıt ekranda; dışa alınabilir, tarihli bir dosya yok |
| **Yönetici / genel müdür** | Haftalık, aylık toplantı | "Markam iyi mi? Fiyat disiplini düzeliyor mu? Pay kimde?" | Hayır: tek ekranlık özet ve dönem karşılaştırması yok |
| **Pazarlama / kategori** | Kampanya öncesi ve sonrası | "Kampanyada fiyat nasıl davrandı? Rakip markalar ne yaptı? Hangi ürün yükseliyor?" | Kısmen: rakip endeksi var; kampanya penceresi ve satış hızı trendi yok |
| **Tedarik / satış operasyon** | Stok planlarken | "Hangi ürün rafta yok? Kimde stok bitiyor?" | Kısmen: satıcısız ürün sayısı var; uyarı yok |

---

## 3. Senaryolar: ne görmekten memnun olurlar

Her senaryo için "gördüğünde memnun olduğu" bilgi. Kalın olanlar bugün yok.

### 3.1 Pazartesi sabahı — marka müdürü güne başlıyor

Bir kahve süresinde şunu görmek ister:

- Şu an bandın dışında kaç ürün var, geçen haftaya göre artmış mı, azalmış mı.
- **Hafta sonu açılan yeni ihlaller ve hâlâ açık olanlar; en uzun süredir açık olan üç tanesi.**
- **İhtar gönderilmiş ama tekrar ihlale düşen bayiler** (en can sıkıcısı).
- **Rafta olmayan ürünler**, özellikle çok değerlendirmesi olanlar.
- Yeni görülen satıcılar, yetkili mi değil mi henüz karar verilmemiş olanlar.
- Verinin taze olup olmadığı: "son 2 saatte bakıldı" — yoksa hiçbir sayı güven vermez.

→ §6.1 Marka Panosu.

### 3.2 Alarm geldi — bir bayi fiyatı kırdı

E-posta "X ürününde Y satıcısı min fiyatın altında" diyor. Müdür tıklayınca:

- Fiyat ne, bant ne, fark yüzde kaç; **raf fiyatıyla mı kırmış, kuponla mı.**
- Bu satıcı bu ürünü **daha önce de kırdı mı, kaç kez, en son ne zaman.**
- Satıcı yetkili bayi mi; **bize maliyetinin altında mı satıyor** (zararına satış = başka
  kaynaktan mal bulmuş olabilir).
- Aynı satıcı **başka ürünlerimde de** bandın dışında mı.
- Tek tıkla: "vaka aç", "ihtar taslağı", "bu bir kampanya, sustur".

→ §6.2 Vaka ve İhtar, §6.7 Kupon ayrımı ve zararına satış.

### 3.3 Bayi görüşmesinden önce — kanal sorumlusu

"Yarın A bayisiyle görüşeceğim":

- **Son 30/90 günde A'nın uyum karnesi:** bandın içinde geçirdiği süre %, ihlal sayısı, ortalama
  sapma, buybox payı, kaç üründe satıyor, kupon kullanımı, ihtar geçmişi.
- **Diğer bayilerle kıyas:** sıralamada nerede.
- **Eğilim:** ihtardan sonra düzeldi mi?
- Görüşmeye götürülebilecek bir PDF veya Excel.

→ §6.4 Satıcı Uyum Karnesi.

### 3.4 İhtar yazılacak — hukuk

- **Tarihli kanıt:** ürün, kart linki, satıcı, satıcının unvanı ve vergi numarası, gözlenen
  fiyat, bant, gözlemin tarihi ve saati; o anki teklif tablosunun tamamı.
- **Süre:** "12–19 Kasım arasında 7 gün boyunca bandın altında".
- **Tekrar:** önceki ihlaller ve ihtar tarihleri.
- Yazdırılabilir, değiştirilemeyen bir dosya.

→ §6.2.

### 3.5 Kampanya dönemi — pazarlama

"11.11'de bütün markada %15 indirim yaptık, min fiyatı geçici olarak düşürdük":

- **Kampanya penceresinde geçici bant**, kampanya bitince eski banda otomatik dönüş.
- **Kampanyaya katılmayan, ya da kampanyadan daha derin indirim yapan satıcılar.**
- **Kampanya sonrası:** fiyatlar normale döndü mü, kim indirimde kaldı.
- Kampanyada satış hızı arttı mı (değerlendirme hızı, §6.10).

→ §6.6 Kampanya takvimi.

### 3.6 Ay sonu — yönetici

- **Dönem karşılaştırması:** fiyat disiplini %, açık ihlal, raf bulunurluğu, yetkisiz satıcının
  buybox payı — bu ay ile geçen ay.
- **En iyi ve en kötü beş bayi;** en çok sorun çıkan beş ürün.
- **Rakip markalara göre fiyat endeksi** (var) ve **satış hızı eğilimi** (yok).
- E-postayla gelen bir özet; ekrana girmeden okunabilen.

→ §6.3 Haftalık/aylık özet, §6.1.

### 3.7 Gri piyasa / sahte şüphesi

- **Yetkili listesinde olmayan, bayi maliyetinin altına satan, yeni görülen** satıcı aynı anda
  — bu üçlü tek başına her birinden çok daha güçlü bir sinyal.
- Markanın adını taşıyıp marka kimliği farklı olan kartlar (var: "marka eşleşmesi uyuşmuyor").
- **Değerlendirme ortalamasında ani düşüş** (kalite / sahte şikâyeti olabilir).

→ §6.7, §6.9.

### 3.8 Stok ve raf — operasyon

- **Rafta olmayan ürünler**, değerlendirme sayısına göre sıralı (en çok kaybettiren önce).
- **Buybox sahibinin stoğu azaldı** ("son 3 adet").
- **Yalnız yetkisiz satıcıda kalan ürünler:** yetkili bayilerin hepsi düşmüş.

→ §6.8.

---

## 4. Fikir havuzu

Beyin fırtınasının tamamı; seçilenler §6'da tasarlanıyor. "Veri" sütunu: **var** = bugün
saklanıyor; **türetilir** = saklanan veriden hesaplanır; **yeni** = yeni toplama gerekir.

### 4.1 Uyum ve fiyat disiplini

| Fikir | Veri | Not |
|-------|------|-----|
| Kupon / raf fiyatı ayrımı ihlalde | var (`price`, `final_price`, promosyon) | §6.7 |
| Zararına satış (bayi birim fiyatının altı) | türetilir (birim fiyat + kâr modeli) | §6.7 |
| "Bandın içinde kalma oranı" ürün ve satıcı bazında | türetilir (gözlem serisi) | §6.5 |
| İhlal süresi ve tekrar sayısı | türetilir (`band_violations`) | §6.2, §6.4 |
| Kampanya penceresi / geçici bant | yeni ayar | §6.6 |
| Tüm satıcılar için bant (yalnız buybox değil) | türetilir | Bulgular zaten yapıyor; alarm yapmıyor. Ayrı alarm türü olarak eklenebilir; gürültüye dikkat |
| PSF gerçekçilik kontrolü: herkes max üstünde / herkes min altında | türetilir | "Bant yanlış olabilir" önerisi; küçük |
| Çapraz pazaryeri bant karşılaştırması | var (barkod eşleşmesi) | Pazaryeri Eşleşmesi'ne bant sütunu; küçük |

### 4.2 Satıcılar ve kanal

| Fikir | Veri | Not |
|-------|------|-----|
| Satıcı Uyum Karnesi | türetilir | §6.4 |
| Yeni satıcı hızlı karar (yetkili / yasaklı / sonra) | var | Pano ve bildirimde tek tık; küçük |
| Bayi kıyas ve sıralama | türetilir | §6.4 |
| Satıcının tüm markalardaki davranışı (grup) | var | Satıcı ayrıntısında; mevcut |
| Stok sinyali: büyük stok tutan satıcılar | var (`offered_stock`) | Gürültülü (stok değişikliği yeni kayıt açmıyor); dikkatli |
| Firma bazında birleştirme (aynı vergi no, çok mağaza) | var (kimlik) | Karnede firma görünümü |

### 4.3 Bulunurluk ve satış

| Fikir | Veri | Not |
|-------|------|-----|
| Raf kaybı uyarısı | var (`has_sellers`) | §6.8 |
| Yalnız yetkisizde kalan ürün | türetilir | §6.8 |
| Buybox sahibinin stoğu azalıyor | var | §6.8 |
| Satış hızı (değerlendirme hızı) ve trend | var (`tracked_product_metrics`) | §6.10 — "tahmin" olarak etiketli |
| Tahmini satıcı payı (buybox süresi × satış hızı) | türetilir | §6.10 |
| Değerlendirme ortalaması düşüşü | var | §6.10 |
| Yeni kart / yeni ürün tespiti (rakip markada lansman) | var (katalog taraması) | "Bu hafta rakip X 12 yeni kart açtı"; küçük |

### 4.4 Süreç ve iletişim

| Fikir | Veri | Not |
|-------|------|-----|
| Vaka ve ihtar dosyası | yeni tablo | §6.2 |
| Haftalık / aylık özet e-postası | türetilir + mevcut kanal | §6.3 |
| Ürün / marka sorumlusu atama ve "benim ürünlerim" | yeni ilişki (kullanıcılar var) | §6.11 |
| Bildirim kuralları: önem eşiği, kişiye yönlendirme, sessiz saatler | yeni ayar | §6.11 |
| Notlar ve etiketler (ürün, satıcı) | yeni | Vakaya dahil |
| PDF / Excel rapor | türetilir | §6.3 ile birlikte |

### 4.5 Değerlendirilip ertelenenler

| Fikir | Neden şimdi değil |
|-------|-------------------|
| Arama sonuç sıralaması ("markam aramada kaçıncı") | Yeni bir genel sayfa kaynağı ve yeni okuma maliyeti. Kurallar gereği yeni kaynak dürüst başlar, ölçülür, sonra karar verilir (CLAUDE.md). İstek gelirse ayrı bir spike |
| Yorum metni analizi | Yorum metni toplanmıyor; yeni kaynak. Ortalama puan düşüşü (§6.10) ilk adım için yeter |
| Teslim süresine göre buybox açıklaması | `dispatch_time` birimi belirsiz, bilerek eşlenmiyor (CLAUDE.md) |
| Satıcıya otomatik ihtar e-postası | Dışarıya, müşteri adına mesaj göndermek; hukuki sorumluluk. Taslak üretip insana bırakmak doğru sınır (§6.2) |
| Trendyol'da barkod | Kart verisinde yok; uydurulmaz |

---

## 5. Önceliklendirme

Değer: senaryolarda kaç kişinin işine yarıyor ve ne kadar sık. Emek: yeni tablo, yeni ekran,
yeni iş.

```
Değer ▲
 yüksek │  Kupon ayrımı ●   Zararına satış ●          Vaka/İhtar ●
        │  Raf uyarısı ●    Pano ●   Haftalık özet ●
        │  Eşleşmemiş kart ●   Uyum karnesi ●   Kampanya ●
  orta  │  PSF gerçekçilik ●   Zaman çizelgesi ●   Satış hızı ●
        │  Yeni satıcı tek tık ●        Sorumlu atama ●
  düşük │                         Stok sinyali ●
        └──────────────────────────────────────────────▶ Emek
           küçük                orta                büyük
```

Üç dalga:

- **Dalga 1 — mevcut veriden hızlı kazanımlar** (yeni tablo yok): kupon / raf ayrımı, zararına
  satış, raf ve stok uyarıları, eşleşmemiş kart kuyruğu, yeni satıcıya tek tık karar, PSF
  gerçekçilik kontrolü.
- **Dalga 2 — çekirdek iş akışı:** Marka Panosu, Vaka ve İhtar Dosyası, haftalık özet e-postası,
  fiyat uyum zaman çizelgesi.
- **Dalga 3 — analiz ve kişiselleştirme:** Satıcı Uyum Karnesi, kampanya takvimi, satış hızı ve
  tahmini pay, sorumlu atama ve bildirim kuralları.

Pano Dalga 2'nin başında, çünkü diğer her özellik kendi kutusunu orada açar.

---

## 6. Özelliklerin tasarımı

Her başlık: ne, neden, ekran, veri ve kural, sınırlar, emek. Kurallar modülün mevcut
ilkelerini izler (§7).

### 6.1 Marka Panosu (`/brand` — markanın "bugün"ü)

**Ne:** Marka modülü açıkken menünün başında tek ekran. Bugünkü Panel satış tarafını anlatıyor;
markanın kendi panosu yok, yalnız bir ihlal sayısı var.

**Ekran** (yukarıdan aşağıya, her kutu bir ekrana götürür):

1. **Veri tazeliği şeridi.** "İlanlar en son 18 dk önce tarandı · katalog turu %62". Bayatsa
   kırmızı, ve aşağıdaki her kutu "bakmadık" uyarısı taşır (Alarmlar'daki kural).
2. **Fiyat disiplini.** Bağlı kartların yüzde kaçında buybox şu an bandın içinde; 7 gün önceki
   değer ve ok. İhlal türlerine göre dağılım (min altı / max üstü / kuponla).
3. **Dikkat gerekenler** (sıralı liste, en fazla 7 satır):
   - en uzun süredir açık ihlaller,
   - ihtardan sonra tekrar eden vakalar (§6.2),
   - zararına satan satıcılar (§6.7),
   - rafta olmayan çok değerlendirmeli ürünler (§6.8),
   - kararı verilmemiş yeni satıcılar (tek tık: yetkili / yasaklı / sonra).
4. **Bu hafta** (7 gün): açılan/kapanan ihlal, yeni satıcı, raf kaybı, en çok buybox alan beş
   satıcı ve payları, en çok değerlendirme kazanan beş ürün.
5. **Satıcı dağılımı:** buybox anlarının yüzde kaçı yetkili / tanımsız / yasaklı satıcıda.

**Veri:** hepsi mevcut sorgular ve `band_violations`; yeni tablo yok. "7 gün önceki değer" için
günlük bir **özet satırı** gerekir (`brand_daily_snapshot`: tarih, bandın içindeki kart oranı,
açık ihlal, satıcısız ürün…). Bu satırı bir günlük iş yazar. Çünkü gözlem arşivi değişiklik
bazlı ve 90 günde budanıyor; "geçen ay bu oran neydi" sorusu her seferinde yeniden hesaplanırsa
pahalı, 90 günden sonra da imkânsız.

**Sınırlar:** Sayılar yalnız **bağlı** kartlar üzerinden; kapsam her kutuda yazılı ("48 karttan
44'ü okundu"). Kapsam yazmayan bir yüzde yalan söyler (doc 06 §12.4'ün kuralı).

**Emek:** orta — bir ekran, bir günlük iş, bir tablo.

### 6.2 Vaka ve İhtar Dosyası

**Ne:** Bir ihlal ya da bulgudan "vaka" açılır ve bayiyle yaşanan sürecin tamamı orada izlenir.
Bugün ihlal açılıyor ve kapanıyor, ama ardından ne yapıldığı hiçbir yerde tutulmuyor.

**Akış:**

```
Açık ──▶ İhtar gönderildi ──▶ İzlemede ──▶ Kapandı (düzeldi)
  │                              │
  └──▶ Kapandı (gerek yok)       └──▶ Tekrarladı ──▶ (yeniden ihtar / yasaklı yap)
```

- **Vaka aç:** Alarmlar, İlanlar, Bulgular ve satıcı ayrıntısından tek tıkla. Vaka bir
  **satıcı** ve bir ya da birden çok **ürün** hakkındadır; bir satıcının üç ürününü aynı
  ihtarda toplamak normal durumdur.
- **Kanıt anlık görüntüsü:** vaka açılırken o anki teklif tablosu, fiyat, bant, kart linki,
  satıcının unvanı ve vergi numarası (Faz 7), gözlem zamanı **vakaya kopyalanır**. Gözlem arşivi
  90 günde budanıyor; ihtar dosyası budanmamalı (`brand_findings.payload` ile aynı gerekçe).
- **İhtar taslağı:** şablondan, Türkçe, yazdırılabilir (PDF / HTML çıktı). Şablon ayarlardan
  düzenlenir: firma adı, imza, yasal metin. **Uygulama göndermez**; kullanıcı indirir ve kendi
  kanalından yollar, sonra "gönderildi" işaretler, istenirse tarih ve kanal girer.
- **Otomatik izleme:** "İzlemede" durumundaki vaka, ilgili ürünlerde satıcı tekrar bandın
  dışına çıkarsa kendiliğinden **"Tekrarladı"** olur ve bildirim gider. Ana değer bu: hukukun
  elindeki en güçlü argüman tekrar, ve bugün kimse onu kendiliğinden görmüyor.
- **Satıcı geçmişi:** satıcı ayrıntısında "Vakalar" sekmesi — kaç vaka, kaç ihtar, kaç tekrar.
- **Not ve ek:** serbest not; dosya eki ileride (dosya saklama yeni bir altyapı).

**Veri:** yeni tablolar: `brand_cases` (satıcı, durum, açılış/kapanış, sorumlu), `brand_case_items`
(ürün/kart, ihlal kimliği, kanıt JSON), `brand_case_events` (durum değişiklikleri, ihtar tarihi,
kim yaptı). Retention: süresiz (hukuki kayıt); kişisel veri yok, firma bilgisi var — doc 18 §10
ile kontrol edilmeli.

**Yetki:** vaka açma/düzenleme `catalogue.manage`; görmek herkes.

**Sınırlar:** Vaka bir **iddia değil, bir kayıt**tır: "uygulama X'in ihlal ettiğini söylüyor"
değil, "X bu tarihte bu sayfada bu fiyattaydı" der. Şablon dili buna göre yazılır.

**Emek:** büyük — üç tablo, iki ekran (liste, ayrıntı), PDF/HTML şablonu, izleme kuralı.

### 6.3 Haftalık / aylık özet e-postası

**Ne:** Pazartesi 08:00'de, seçilen alıcılara tek bir e-posta: §6.1'in "Bu hafta" ve
"Dikkat gerekenler" kutularının metin hâli, dönem karşılaştırmasıyla. Ayda bir de aylık
özet.

**İçerik:**

- Fiyat disiplini: %X (geçen hafta %Y).
- Açılan / kapanan / açık ihlal; en uzun süredir açık üç tanesi.
- Tekrarlayan vakalar; zararına satanlar; rafta olmayan önemli ürünler.
- En iyi ve en kötü üç bayi (§6.4 varsa).
- "Uygulamada aç" linkleri (kurulumun `PUBLIC_ORIGIN`'i biliniyorsa).

**Veri:** §6.1'in sorguları ve `brand_daily_snapshot`; gönderim mevcut e-posta kanalıyla
(doc 17 §6). Yeni iş: `SendBrandDigest` (haftalık ve aylık ayrı zamanlama).

**Ayarlar:** açık/kapalı, alıcılar (bildirim alıcılarından ayrı liste: yönetici anlık alarm
istemez, özet ister), gün ve saat.

**Sınırlar:** Veri bayatsa e-posta bunu **ilk satırda** söyler; "0 ihlal" ile "bakamadık" aynı
e-postada karışmaz.

**Emek:** orta.

### 6.4 Satıcı Uyum Karnesi

**Ne:** Her satıcı için seçilen dönemde (30/90 gün) tek satırlık bir karne, ve bunların
sıralanabilir listesi. "Marka Satıcıları" ekranı bugün satıcının ne kadar sattığını (teklif,
buybox) söylüyor; **ne kadar uyduğunu** söylemiyor.

**Ölçüler** (hepsi bağlı kartlar üzerinden):

| Ölçü | Tanım |
|------|-------|
| Bantta kalma oranı | Satıcının buybox'ta olduğu sürenin yüzde kaçı bandın içinde (süre ağırlıklı, gözlem serisinden) |
| İhlal sayısı ve toplam süre | `band_violations` bu satıcı için |
| Ortalama sapma | Teklif fiyatının PSF × çarpana göre ortalama farkı |
| Kupon payı | İhlallerinin yüzde kaçı yalnız kuponla (§6.7) |
| Zararına satış | Zararına sattığı ürün sayısı |
| Buybox payı | Markanın buybox anlarındaki payı (mevcut) |
| Kapsam | Kaç üründe satıyor |
| Vaka geçmişi | Vaka / ihtar / tekrar sayısı (§6.2 varsa) |

**Uyum puanı** (0–100): yalnızca sıralama için, ağırlıkları ayardan değişebilen basit bir
toplam. Ekranda puanın **neden** o olduğu her zaman yazılı; "puan 62" tek başına
gösterilmez. Puanın bir karar aracı olmadığı, bir sıralama yardımı olduğu açıkça söylenir.

**Firma görünümü:** aynı vergi numarasının mağazaları tek satırda birleştirilebilir (Faz 7
kimliği varsa).

**Çıktı:** Excel ve yazdırılabilir tek sayfalık "bayi karnesi" — görüşmeye götürülecek belge.

**Emek:** orta — sorgular ağır, ama tablo gerekmiyor; günlük özet (§6.1) varsa ucuzlar.

### 6.5 Fiyat uyum zaman çizelgesi

**Ne:** Ürün ayrıntısında ve İlanlar'da bir kartın son 30 günü: buybox fiyatı çizgisi, bandın
alt ve üst sınırı gölgeli alan, ihlal dönemleri kırmızı, buybox sahibi değiştikçe renk. Altında
"Son 30 günde bandın içinde: %87 · 3 ihlal · en uzun 2 gün".

**Veri:** `tracked_product_observations` (değişiklik bazlı; her kayıt bir sonrakine kadar geçerli)
ve `band_violations`. Seri tam olarak kurulabiliyor; boşluklar (başarısız bakış) grafikte boşluk
olarak görünür, sıfır olarak değil (Takip Edilen Ürünler'deki kural).

**Ek:** satıcı başına küçük çizgiler (en çok buybox alan üç satıcı), kampanya pencereleri (§6.6)
gri bantla.

**Emek:** orta — bir grafik bileşeni, bir sorgu. dataviz kurallarına göre.

### 6.6 Kampanya takvimi ve geçici bant

**Ne:** Marka planlı bir kampanya yaptığında (11.11, Black Friday, marka haftası) bant geçici
olarak değişir. Bugün iki kötü seçenek var: bandı elle değiştirip geri almayı unutmak, ya da
kampanya boyunca yüzlerce sahte ihlal almak.

**Model:** `brand_campaigns`: ad, başlangıç, bitiş, kapsam (tüm marka / ürün listesi / kategori),
kural (PSF'ye göre % indirim **veya** sabit geçici min/max), not.

**Davranış:**

- Pencere içinde bant değerlendirmesi kampanya bandını kullanır; `threshold_applied` hangi
  kampanyanın uygulandığını kaydeder (doc 17 §5.3'teki ilkeyle aynı).
- Pencere bitince eski banda kendiliğinden döner; bir sonraki bakış eski banda göre değerlendirir.
- **Kampanya raporu:** pencere boyunca katılmayanlar (PSF'de kalanlar), kampanyadan derine
  inenler, pencere bitince indirimde kalanlar.
- Takvim görünümü: yaklaşan ve geçmiş kampanyalar; çizelgede (§6.5) gri bant.

**Sınırlar:** Kampanya yalnız **bandı** değiştirir; hiçbir şey göndermez ve hiçbir fiyatı
etkilemez (raporlama modülü). Çakışan kampanyada en derin indirim değil, **en yeni tanımlanan**
uygulanır ve ekranda uyarı çıkar; çakışma kuralı ürün sahibine sorulacak (§8).

**Emek:** orta — bir tablo, bir ekran, değerlendirme fonksiyonunda bir parametre (saf
`evaluateBand` zaten eşiği dışarıdan alıyor).

### 6.7 Kupon ayrımı ve zararına satış (Dalga 1)

**Kupon ayrımı.** İhlal bugün `final_price` ile (yoksa `price`) değerlendiriliyor (doc 17 §5.1).
Ama marka müdürü için "rafa indirimli fiyat koymuş" ile "raf fiyatı doğru ama kupon vermiş"
farklı konuşmalar; ikincisi çoğu zaman pazaryerinin kendi kampanyasıdır.

- İhlale bir alan: `basis = shelf | coupon` — raf fiyatı da bandın dışındaysa `shelf`, yalnız
  kupon sonrası dışındaysa `coupon`.
- Alarmlar ve İlanlar'da rozet: **raf** / **kupon**; filtre. Promosyon metni (varsa) yanında.
- Ayar (isteğe bağlı): "yalnız kuponla oluşan ihlalleri bildirme".

**Zararına satış.** Kâr modeli (doc 17 §8) her kart için "0 kâr fiyatı"nı zaten hesaplıyor.

- Buybox sahibi 0 kâr fiyatının altındaysa **"zararına satıyor"** işareti; İlanlar'da sütun,
  Pano'da kutu, isteğe bağlı bildirim.
- Neden önemli: bayi, distribütörden aldığı fiyatın altında satamaz. Satıyorsa ya başka
  kaynaktan mal bulmuştur (gri piyasa), ya stok eritiyordur, ya da tahmin girdileri yanlıştır.
  Üçü de bakmaya değer, ve ekran üçünü de olasılık olarak söyler.
- Tahmin girdisi eksikse (tarife yok, desi yok) işaret **gösterilmez**; eksik girdi adıyla
  yazılır (mevcut kural).

**Emek:** küçük — iki alan, iki rozet, bir sütun.

### 6.8 Raf ve stok uyarıları (Dalga 1)

Üç yeni durum, Alarmlar'da ayrı bir "Bulunurluk" bölümü olarak:

| Durum | Tanım | Kaynak |
|-------|-------|--------|
| **Rafta yok** | Bağlı kartın son başarılı bakışında hiç satıcı yok (`has_sellers = false`) | var |
| **Yalnız yetkisizde** | Satıcı var ama hiçbiri yetkili değil (politika tanımlıysa) | türetilir |
| **Stok azalıyor** | Buybox sahibinin `offered_stock` değeri eşiğin altında (varsayılan 3) | var |

- Hepsi ihlalle aynı **durum** modelinde: açılır, sürer, kapanır; açılışta bildirilir.
- "Rafta yok" önemine göre sıralanır: değerlendirme sayısı çok olan önce.
- Başarısız bakış hiçbir durumu açmaz ya da kapatmaz (modülün değişmez kuralı).

**Sınırlar:** `offered_stock` pazaryerinin gösterdiği sayıdır, satıcının gerçek stoğu değil;
bazı satıcılar sabit bir sayı gösterir. Ekran "pazaryerinde görünen stok" der.

**Emek:** küçük-orta.

### 6.9 Eşleşmemiş kart kuyruğu (Dalga 1)

**Ne:** Markanın katalog taramasında görünen ama hiçbir marka ürününe bağlı olmayan kartlar,
"kimin olduğu belli değil" kuyruğu olarak. Bugün Takip Edilen Ürünler'de binlerce kartın
arasında kayboluyorlar.

- Sıralama: değerlendirme sayısı (çok satan önce), satıcı sayısı.
- Her kart için öneri: barkodu bir ürünle eşleşiyorsa (Hepsiburada) "bu sizin X ürününüz olabilir"
  (mevcut öneri mantığı); eşleşmiyorsa adıyla benzer ürünler — **yalnız öneri**, otomatik bağlama
  yok (isimle eşleştirme yasağı).
- Eylemler: ürüne bağla · yıldızla · "bizim değil / önemsiz" diye kuyruktan çıkar (hatırlanır).
- Pano'da sayı: "Bu hafta markanın altında 14 yeni kart".

**Emek:** küçük — bir filtrelenmiş görünüm, bir "yok say" alanı.

### 6.10 Satış hızı ve tahmini pay (Dalga 3)

**Ne:** Satış adedi görünmüyor; değerlendirme sayısının artış hızı en yakın genel sinyal
(`tracked_product_metrics`, doc 05). Bunu ürünler ve satıcılar için okunabilir hâle getirmek.

- **Ürün:** son 7/30 günde kazanılan değerlendirme; önceki döneme göre değişim; "yükselenler /
  düşenler" listesi. Ortalama puanda ani düşüş (örn. 30 günde 0,3 puandan fazla) **uyarı**.
- **Tahmini satıcı payı:** her ürünün değerlendirme artışını, o dönemde buybox'ı tutan
  satıcılara buybox süresine göre paylaştır. Sonuç: "A bayisi tahminen satışların %34'ünü
  yapıyor". **Her yerde "tahmin" etiketiyle** ve yöntemi açıklayan bir notla.

**Sınırlar:** Değerlendirme her satışta yazılmaz, oranı ürüne göre değişir; mutlak adet
söylenmez, yalnız **göreli** pay ve eğilim. Yorum metni toplanmıyor.

**Emek:** orta — sorgu ve iki ekran parçası.

### 6.11 Sorumlu atama ve bildirim kuralları (Dalga 3)

- **Sorumlu:** her marka ürününe ve izlenen markaya bir kullanıcı atanabilir (kullanıcılar var,
  doc 18). "Benim ürünlerim" filtresi; vakaların sorumlusu; bildirimler sorumluya.
- **Bildirim kuralları:** önem eşiği (örn. yalnız %10'dan derin ihlal), türe göre açma/kapama
  (kupon, rafta yok, yeni satıcı), sessiz saatler (gece SMS yok), alıcıyı ürün sorumlusuna
  yönlendirme.
- **Emek:** orta — bir ilişki tablosu, ayar ekranı, bildirim yönlendirmesi.

### 6.12 Küçük ekler

- **Yeni satıcıya tek tık karar:** Pano ve bildirimden "Yetkili / Yasaklı / Sonra bak".
- **PSF gerçekçilik kontrolü:** 30 gün boyunca bütün satıcılar max'ın üstünde ya da min'in
  altındaysa ürün ayrıntısında "Bant piyasadan uzak olabilir" notu, medyan fiyatla.
- **Çapraz pazaryeri bandı:** Pazaryeri Eşleşmesi'ne her iki tarafın bant durumu.
- **Rakip lansmanları:** rakip markanın kataloğunda bu hafta görünen yeni kartlar (Marka
  Karşılaştırması'nda kutu).

---

## 7. Değişmeyen ilkeler

Her öneri bunlara uyar; uymayan bir tasarım geri döner.

- **Raporlama.** Marka modülündeki hiçbir şey bir fiyat göndermez, bir fiyat kararına girmez.
- **Başarısız bakış kanıt değildir.** Okunamayan sayfa hiçbir durumu açmaz, kapatmaz, "sorun yok"
  demez. Her sayı yanında veri tazeliği ve kapsam yazılıdır.
- **İsimle eşleştirme yok.** Satıcı, ürün ve firma yalnızca kimlikle (seller id, vergi no,
  barkod, kart id) eşleşir; isim benzerliği yalnız öneri olabilir.
- **Tahmin tahmin diye söylenir.** Kâr, satış hızı, pay — hepsi etiketli, eksik girdi adıyla
  yazılır, varsayılan değerle doldurulmaz.
- **Yeni kaynak dürüst başlar.** Arama sıralaması gibi yeni bir genel sayfa okuma ölçülmeden
  açılmaz (CLAUDE.md).
- **Dışarıya mesaj göndermeyiz.** İhtar taslak olarak üretilir; gönderen insandır.
- **Para `bigint` kuruş**, her yerde TL biçiminde (2026-11-19 kararı).

---

## 8. Ürün sahibine sorular

Seçimden önce cevaplanması işi değiştirecek sorular:

1. **Hangi dalgadan başlayalım?** Önerim: Dalga 1'in tamamı (2–3 gün), ardından Pano ve Vaka.
2. **İhtar şablonu** — hukuk biriminin kullandığı bir metin var mı? Taslak hangi bilgileri
   içermeli (firma bilgileri, sözleşme maddesi, süre)?
3. **Vaka kimin işi?** Tek kişi mi, ürün sorumlularına mı dağılıyor? (§6.11'in önceliği buna
   bağlı.)
4. **Kupon ihlalleri** bildirilsin mi, yoksa yalnız ekranda mı kalsın?
5. **Kampanya çakışması:** iki kampanya aynı ürüne denk gelirse hangisi geçerli olsun?
6. **Özet e-postası** kime, hangi gün ve saatte?
7. **Uyum puanı** gösterilsin mi? Bazı ekipler tek bir sayının bayiyle konuşmayı
   zorlaştırdığını düşünüyor; puan yerine yalnız ölçüler de gösterilebilir.

---

## 9. Önerilen yol

| Sıra | İş | Bağımlılık |
|------|----|-----------|
| 1 | Kupon/raf ayrımı + zararına satış (§6.7) | — |
| 2 | Raf ve stok uyarıları (§6.8) | — |
| 3 | Eşleşmemiş kart kuyruğu, yeni satıcıya tek tık, PSF gerçekçilik (§6.9, §6.12) | — |
| 4 | Günlük özet tablosu `brand_daily_snapshot` + Marka Panosu (§6.1) | 1–3'ün kutuları |
| 5 | Vaka ve İhtar Dosyası (§6.2) | şablon kararı (§8.2) |
| 6 | Haftalık / aylık özet e-postası (§6.3) | 4 |
| 7 | Fiyat uyum zaman çizelgesi (§6.5) | — |
| 8 | Satıcı Uyum Karnesi (§6.4) | 4, 5 |
| 9 | Kampanya takvimi (§6.6) | §8.5 |
| 10 | Satış hızı ve tahmini pay (§6.10); sorumlu ve bildirim kuralları (§6.11) | 4 |

Her adım ayrı bir spec ve ayrı bir faz olur (doc 12). Her biri kendi testleriyle ve Rehber
güncellemesiyle gelir (doc 19 §7).
