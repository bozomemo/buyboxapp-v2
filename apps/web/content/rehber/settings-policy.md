---
id: settings-policy
title: Fiyat Politikası
section: screens
order: 44
module: seller
routes:
  - /settings/policy
---

**Politika** sekmesi, otomatik fiyatlandırmanın her pazaryerinde nasıl davranacağını belirler: buybox'ı almak için ne kadar ineceği, buybox elimizdeyken ne kadar hızlı yükseleceği, stok ve bütçe kuralları. Pazaryeri başına otomasyonu açıp kapattığınız anahtar da buradadır. Hangi kararın neden verildiğini anlamak için önce [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing) bölümünü okuyun.

Fiyat hiçbir ayarla [taban fiyatın](/rehber/concepts-floor-price) altına indirilmez.

## Pazaryeri

En üstteki **Pazaryeri** listesinden **Trendyol** veya **Hepsiburada**'yı seçin. Her pazaryerinin politikası ayrıdır. Henüz kayıt yoksa varsayılan değerler gösterilir ve bir not bunu belirtir.

## Otomasyon

**Otomasyon** kartındaki düğme **Açık** veya **Kapalı** gösterir. Açıkken o pazaryerinde fiyatlar bu politikaya göre otomatik gönderilir.

- Açmak için düğmeye tıklayın; bir onay penceresi çıkar. Onaylarsanız fiyatlar bu andan itibaren otomatik gönderilir.
- Kapatmak tek tıklamadır; onay sorulmaz.
- Düğme yalnızca formu değiştirir. Değişikliğin geçerli olması için sayfanın altındaki **Kaydet**'e tıklayın.

Otomasyonu acil durumda hemen durdurmak için [Panel](/rehber/panel) ekranındaki durdurma anahtarlarını kullanın. Bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop).

## Strateji

- **Kaba Adım Türü**: buybox bizdeyken fiyatın hangi birimle yükseltileceği. **Yüzde** seçilirse adım fiyatla birlikte büyür; **Sabit tutar** seçilirse her denemede aynı tutar eklenir. Seçime göre altındaki alan değişir.
- **Kaba Adım (%)**: buybox bizdeyken her denemede fiyatın yüzde kaç yükseltileceği. Büyük değer daha hızlı yükselir ama buybox'ı daha sık kaybettirir.
- **Kaba Adım (₺)**: yalnızca **Sabit tutar** seçiliyken görünür. Buybox bizdeyken her denemede fiyata eklenecek tutar. Örnek: 2,50. Tutar boşsa, sıfır ya da eksiyse veya tutar olarak okunamıyorsa politika kaydedilmez ve sayfanın altında nedeni yazar.
- **İnceltme Toleransı (₺)**: buybox kaybedilince uygulama doğru fiyatı arar. İki fiyat arasındaki fark bu tutarın altına düşünce aramayı bitirir. Örnek: 1 TL.
- **Arama Stratejisi**: buybox bizde değilken nasıl ineceği. **Doğrudan (önerilen)** fiyatı tek seferde buybox fiyatının hemen altına indirir. **Kademeli** küçük adımlarla iner.
- **Buybox'ın Altına İnme Tutarı (₺)**: buybox'ı almak için buybox fiyatının ne kadar altına inileceği.
- **Kademeli Arama Adımı (₺)**: **Kademeli** stratejide her adımın tutarı. Yalnızca arama stratejisi **Kademeli** iken kullanılır.
- **Tek Satıcı Marjı (%)**: üründe başka satıcı yoksa maliyetin üstüne eklenecek kâr yüzdesi. Örnek: maliyet 100 TL ve marj %20 ise net hedef 120 TL'dir.

## Kâr Koruma

- **Düşük stok koruması etkin**: işaretlerseniz, stoğu az olan bir rakiple rekabet etmek için ek kâr istenir. Böyle bir rakip yakında tükeneceği için onunla fiyat kırmak çoğu zaman gereksizdir.
- **Düşük Stok Eşiği (adet)**: rakibin stoğu bu sayının altındaysa "düşük stok" sayılır.
- **Düşük Stok İçin Ek Marj (%)**: bu durumda istenen ek kâr yüzdesi.

## Stok

- **Stok Modu**: **Stoğu yok say** seçilirse fiziksel stok fiyat kararını etkilemez. **Fiziksel stoğu dikkate al** seçilirse stoğu aşağıdaki sayının altında olan ilanlar otomatik fiyatlandırılmaz.
- **Minimum Fiziksel Stok (adet)**: yalnızca stok modu **Fiziksel stoğu dikkate al** iken kullanılır.

## Hız ve Bütçe

- **Yerleşme Süresi (dakika)**: bir fiyat pazaryerine gönderilip onaylandıktan sonra, yeni bir karar vermeden önce piyasanın oturması için beklenen süre.
- **Rakip Fiyat Değişim Eşiği (₺)**: rakip fiyatındaki bu tutardan küçük değişiklikler yeniden fiyatlandırmayı tetiklemez.
- **Sorgulama Aralığı (dakika)**: buybox bilgisinin ne sıklıkla okunacağı.
- **Eşzamanlılık**: aynı anda kaç ilanın değerlendirileceği.
- **Günlük Bütçe Rezervi (%)**: pazaryerleri günlük fiyat güncelleme sayısını sınırlar. Bu yüzde, zararına satan ilanları düzeltmek ve buybox'ı geri almak gibi acil kararlar için ayrılır.

## Etkiyi Önizle ve Kaydet

**Etkiyi Önizle**, formdaki henüz kaydedilmemiş politikayı mevcut ilanlarınız üzerinde deneme olarak çalıştırır; hiçbir fiyat gönderilmez. Sonuçta kaç ilanın fiyat değiştireceği, kaçının değişmeyeceği ve eksik veri yüzünden kaçının hesaplanamadığı yazar. **Ortalama değişim** ve örnek ilanlardan oluşan bir tablo (**Ürün**, **Eski**, **Yeni**, **Sebep**) da gösterilir. Önizleme için o pazaryerinin ücret ayarları kayıtlı olmalıdır; değilse **Önce bu pazaryeri için ücret ayarlarını kaydedin.** uyarısı çıkar. Bkz. [Ücretler](/rehber/settings-fees).

**Kaydet** politikayı ve otomasyon durumunu kaydeder; **Politika kaydedildi.** mesajı görünür.

**Etkiyi Önizle** ve **Kaydet** yalnızca Yönetici rolüne açıktır. Diğer roller değerleri görebilir.

## Sık sorulanlar

**Otomasyonu açtım ama fiyatlar gönderilmiyor.**
Düğmeyi değiştirdikten sonra **Kaydet**'e bastığınızdan emin olun. Ayrıca [Panel](/rehber/panel) ekranında genel durdurma veya fiyat gönderim anahtarının açık olup olmadığına ve [Pazaryerleri](/rehber/settings-marketplaces) ekranında pazaryerinin **Etkin** olduğuna bakın.

**Önizlemede çok sayıda ilan "hesaplanamadı" görünüyor.**
Bu ilanlarda maliyet veya buybox bilgisi eksiktir. Maliyetleri [Stok](/rehber/stock) ekranında, ilanları [İlanlar](/rehber/listings) ekranında kontrol edin.

**Politika değişikliği ne zaman etkili olur?**
Kaydettiğiniz andan sonraki ilk değerlendirmede.

<!-- kaynak: doc 03 §3, §5, §6, §8, doc 06 §9, doc 15 §3.6; apps/web/src/app/settings/policy/page.tsx, settings/policy/policy-client.tsx, app/api/settings/policy/save/route.ts, app/api/settings/preview-impact/route.ts, lib/labels.ts (DECISION_REASON_LABELS) -->
