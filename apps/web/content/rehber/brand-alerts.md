---
id: brand-alerts
title: Marka Alarmları
section: screens
order: 22
module: brand
routes:
  - /brand/alerts
---

**Marka Denetimi → Alarmlar** ekranı fiyat aralığı ihlallerini listeler. Ürünlerinizden birine bağlı bir kartta **buybox'ı tutan satıcı** aralığınızın dışında satıyorsa burada bir ihlal açılır. Ekran yalnızca raporlama içindir; hiçbir fiyatı değiştirmez. Bir bildirim aldığınızda ya da günün başında "kim bandımın dışında satıyor?" sorusu için açın.

## İhlal nasıl açılır ve kapanır

Her başarılı bakışta, bağlı kartın buybox satıcısının fiyatı ürününüzün aralığıyla karşılaştırılır:

- **Min altında**: fiyat, Min × çarpandan düşük. Ürüne Min girilmemişse bu kontrol yapılmaz.
- **Max üstünde**: fiyat, üst sınır × çarpandan yüksek. Max girilmemişse üst sınır PSF'dir.

Fiyat olarak kupon sonrası fiyat kullanılır; kart kupon vermiyorsa liste fiyatı kullanılır. Raf (liste) fiyatı aralıktaysa ve yalnız kupon sonrası fiyat Min altına düşüyorsa ihlal **yalnız kupon** diye işaretlenir. Bu çoğu zaman pazaryerinin kendi kampanyasıdır ve bayiyle konuşmanız farklıdır.

İhlal bir **durumdur**, tek seferlik bir olay değildir:

- İlk kez aralık dışı görüldüğünde açılır ve bildirim gönderilir.
- Sonraki bakışlar da aralık dışı gösterirse aynı satır güncellenir; yeni bildirim gitmez.
- Buybox aralık dışında satan **başka bir satıcıya** geçerse eski ihlal kapanır, yeni satıcı için yenisi açılır ve bildirilir.
- **Başarısız bir bakış hiçbir şeyi değiştirmez.** Okunamayan sayfa fiyat hakkında bir şey söylemez.

PSF, Min veya Max'ı değiştirirseniz yeni sınır kartın bir sonraki başarılı bakışında uygulanır. Aralığın nasıl tanımlandığı için bkz. [Marka Stok](/rehber/brand-products#fiyatlar-birim-basinadir).

## Güncel olmayan veri uyarısı

Bir pazaryerinde İlanlar taraması son birkaç saattir başarılı olmadıysa sayfanın en üstünde kırmızı **Bu alarmlar güncel veriye dayanmıyor** kutusu çıkar. Kutuda pazaryeri başına son başarılı tarama zamanı ya da _ilanlar henüz hiç başarıyla taranmadı_ yazar.

Bu kutu görünürken alarm olmaması "sorun yok" anlamına gelmez; "bakmadık" anlamına gelir. [İşler](/rehber/jobs) ekranında **İlanlar Turu** işinin açık olduğunu ve hata vermediğini kontrol edin.

## Açık ihlaller

İhlaller ürüne göre gruplanır. Grup başlığında ürün adı (tıklayınca ürün sayfası açılır) ve ihlal sayısı yazar. **Excel'e Aktar** açık ihlalleri dosya olarak indirir; dosyadaki **Neden** sütunu **Raf fiyatı** ya da **Yalnız kupon** yazar.

Yalnız kuponla oluşan bir ihlal varsa tablonun üstünde **Tümü**, **Raf fiyatı** ve **Yalnız kupon** düğmeleri çıkar. Düğmeye basınca tablo yalnız o türü gösterir.

- **Kart**: kart adı, **↗** ile pazaryerindeki sayfa, pazaryeri ve çarpan 1 değilse **×3** gibi çarpan.
- **İhlal**: **Min altında** (kırmızı) ya da **Max üstünde** (turuncu).
- **Buybox satıcı**: aralık dışında satan satıcı.
- **Fiyat**: son görülen fiyat. **kuponlu**: kupon sonrası fiyat, raf fiyatı da aralık dışında. **yalnız kupon**: raf fiyatı aralıkta, yalnız kupon sonrası fiyat dışında.
- **Sınır**: kartın sınırı, yani birim sınır × çarpan. İhlal açıldığında geçerli olan sınırdır.
- **Fark**: fiyatın sınırdan yüzde kaç uzak olduğu, örneğin **−%12,5**. En büyük farklar en acil olanlardır.
- **Süre**: ihlalin ne zamandır sürdüğü. Üzerine gelince başlangıç tarihi görünür.
- **Son görülme**: ihlalin en son doğrulandığı bakış.
- **Bildirim**: kanal başına bildirim durumu: **webhook**, **e-posta**, **SMS** ve yanında
  - **✓**: gönderildi,
  - **bekliyor**: henüz gönderilmedi; kanal kurulmamışsa nedeni üzerine gelince görünür,
  - **başarısız** (kırmızı): gönderilemedi,
  - **sessiz**: aynı satıcı aynı kartta kısa süre önce de ihlal yaptığı için tekrar bildirilmedi.

Bildirim kanallarını ve alıcıları [Bildirim Ayarları](/rehber/settings-notifications) ekranında kurarsınız.

## Bulunurluk

**Bulunurluk** bölümü ürünlerinize bağlı kartlarda rafın durumunu gösterir. Fiyattan bağımsızdır ve her kartın son başarılı bakışına dayanır:

| Uyarı | Anlamı |
|---|---|
| **Rafta yok** | Son başarılı bakışta kartı satan kimse yok. Ayrıntıda en son ne zaman satıcı görüldüğü yazar. |
| **Yalnız yetkisiz satıcıda** | Kartta satıcı var ama hiçbiri yetkili listenizde değil. Yalnız markanız için en az bir **Yetkili** kural tanımlıysa gösterilir ([Satıcı Politikası](/rehber/seller-policy)). |
| **Stok azalıyor** | Buybox'taki satıcının pazaryerinde gösterdiği stok 3 adedin altında. |

Satırlar uyarı türüne, sonra değerlendirme sayısına göre sıralanır: çok satan kart önce gelir. Hiç başarıyla okunmamış kart için uyarı çıkmaz; "bakmadık" "satan yok" demek değildir.

Stok, pazaryerinin ekranda gösterdiği sayıdır. Bazı satıcılar sabit bir sayı gösterir; bu yüzden uyarıyı bir işaret olarak okuyun.

## Kapananlar

**Son … günde kapananlar** tablosu yakın zamanda biten ihlalleri gösterir: **Stok ürünü**, **Kart**, **İhlal**, **Satıcı**, **Son fiyat**, **Sınır**, **Süre** ve **Kapanış**. **Kapanış** sütununda neden ve ne kadar önce kapandığı yazar:

| Kapanış | Anlamı |
|---|---|
| **Banda döndü** | Fiyat aralığın içine girdi |
| **Buybox el değiştirdi** | Buybox aralık içinde satan başka bir satıcıya geçti |
| **Satan kalmadı** | Kartta satıcı kalmadı |
| **Min kaldırıldı** | Üründen Min silindi |
| **Kart bağı kaldırıldı** | Kart üründen ayrıldı |

Bir ürünü silerseniz ihlalleri de silinir ve bu listede görünmez.

## Sık sorulanlar

**Açık ihlal yok ama emin değilim. Gerçekten sorun yok mu?**
Sayfanın üstünde kırmızı uyarı kutusu yoksa son tarama günceldir ve buybox satıcılarının hepsi aralıktadır. Kutu varsa veri eskidir.

**Buybox dışındaki satıcılar aralık dışında satıyorsa burada görünür mü?**
Hayır. Bu ekran yalnızca buybox'ı tutan satıcıya bakar. Ucuza satan diğer satıcılar için [Denetim Bulguları](/rehber/findings) ekranına bakın.

**Aynı ihlal için neden tekrar bildirim almıyorum?**
İhlal sürdükçe yeni bildirim gitmez; yalnızca açılışta bildirilir. **sessiz** yazıyorsa satıcı kısa süre içinde tekrar aralık dışına çıkmıştır ve tekrar bildirilmemiştir.

**Bildirim sütununda "bekliyor" yazıyor ve hiç değişmiyor.**
O kanal kurulmamış olabilir; üzerine gelince nedeni görünür. Kanalı [Bildirim Ayarları](/rehber/settings-notifications) ekranında kurduğunuzda bekleyenler toplu gönderilir.

**"Yalnız kupon" ihlali de bildirilir mi?**
Evet. Bildirim metninde "yalnız kuponla; raf fiyatı bantta" yazar.

**Max'ı yükselttim ama ihlal hâlâ açık.**
Yeni sınır kartın bir sonraki başarılı bakışında uygulanır. İlanlar turu yaklaşık yarım saatte bir döner.

<!-- kaynak: doc 17 §5, §6; brand roadmap §6.7, §6.8; apps/web/src/app/brand/alerts/alerts-client.tsx; api/brand/alerts permission -->
