---
id: brand-listings
title: Marka İlanları
section: screens
order: 21
module: brand
routes:
  - /brand/listings
---

**Marka Denetimi → İlanlar** ekranı, gerçekten izlediğiniz pazaryeri kartlarını gösterir. Bir markanın kataloğunda yüzlerce kart olabilir ama çoğu satmaz; bu ekran yalnızca iki tür kartı listeler:

- [Stok](/rehber/brand-products) ekranında **ürünlerinizden birine bağlı** kartlar,
- [Takip Edilen Ürünler](/rehber/tracked-products) ekranında ya da burada **yıldızladığınız** (favori) kartlar.

Bu kartlara yaklaşık yarım saatte bir bakılır ve buybox fiyatı fiyat aralığınızla karşılaştırılır. Günlük kontrol için açacağınız ana ekran budur.

## Arama ve filtre

- **Ara (kart adı veya ürün kodu)**: yazıp Enter'a basın ya da **Ara**'ya tıklayın.
- **Pazaryeri**: **Hepsi**, **Trendyol** ya da **Hepsiburada**.
- **Excel'e aktar**: o anki filtreyle listeyi dosya olarak indirir.

Tablonun üstündeki satır, bu sayfadaki kartlardan kaçının aralık dışında olduğunu söyler. Bu sayı yalnızca ekrandaki sayfa içindir; tüm açık ihlaller için [Marka Alarmları](/rehber/brand-alerts) ekranına bakın. Buybox satıcısı tahmini maliyetinin altında satıyorsa aynı satırda kaç kartta böyle olduğu da yazar. Durumu **Bilinmiyor** olan kartlar "aralıkta" sayılmaz; kaç kartın durumunun henüz bilinmediği ayrıca yazar.

## Sütunlar

- **☆ / ★**: kartı favorilere ekler ya da çıkarır. Bu işlem Yönetici ve Fiyat Yöneticisi rollerine açıktır. Bağlı olmayan bir kartın yıldızını kaldırırsanız kart bu listeden çıkar.
- **Kart**: kartın adı. **↗** pazaryerindeki ürün sayfasını yeni sekmede açar. Yanında pazaryeri yazar; **· duraklatıldı** kartın düzenli taramadan çıkarıldığını gösterir.
- **Stok ürünü**: kartın bağlı olduğu ürününüz; tıklayınca ürün sayfası açılır. **Bağlı değil (favori)** ise kart yalnızca yıldızlıdır. Bu kartın PSF'si ve aralığı yoktur, bu yüzden alarm da üretmez.
- **Çarpan**: bir alışta kaç adet ürün gittiği, örneğin **×3**.
- **Buybox satıcı**: buybox'ı tutan satıcı.
- **Buybox fiyat**: buybox satıcısının fiyatı. Yanında **kuponlu** yazıyorsa bu, kupon sonrası müşterinin ödediği fiyattır.
- **Birim buybox**: buybox fiyatının çarpana bölünüp yuvarlanmış hâli. Yalnızca PSF ile göz kararı karşılaştırmak içindir; sistem karar verirken bölme yapmaz, eşiği çarpanla çarpar.
- **PSF**, **Min**, **Üst sınır**: ürününüzün birim fiyatları. **Üst sınır** yanında **PSF** yazıyorsa Max girilmemiştir. Bağlı olmayan kartta **—** görünür.
- **Durum**: buybox fiyatının aralığa göre yeri:
  - **Aralıkta**: sınırların içinde (soluk yazılır, dikkat gerektirmez).
  - **Min altında** (kırmızı): buybox fiyatı alt sınırın altında.
  - **Max üstünde** (turuncu): buybox fiyatı üst sınırın üstünde.
  - **Bilinmiyor**: karta henüz bakılmadı ya da son bakış başarısız oldu. Okunamayan sayfa ihlal sayılmaz.
- **Açık ihlal**: açık bir fiyat ihlali varsa ne zamandır sürdüğü. Tıklayınca **Alarmlar** ekranı açılır.
- **Komisyon**: buybox fiyatının, komisyon tarifesinde düştüğü kademenin oranı. Ürünün geçerli tarifesi yoksa [Kâr Ayarları](/rehber/brand-profit)'ndaki varsayılan komisyon kullanılır ve oranın yanında **varsayılan** yazar. Excel dosyasındaki **Komisyon Kaynağı** sütunu **Tarife** ya da **Varsayılan** yazar.
- **Tahmini kâr**: buybox satıcısının bu satıştan tahmini kârı ve fiyata oranı. Eksi ise kırmızı yazılır ve yanında **zararına** etiketi çıkar. Üzerine gelince ayrıntı görünür: komisyon, kargo, operasyon, sabit satış bedeli ve birim fiyat.
- **0 kâr fiyatı**: satıcının zarar etmediği en düşük fiyat.
- **Satıcı**: karttaki satıcı sayısı.
- **Son bakış**: karta en son bakılan zaman. **hiç** ise henüz bakılmadı.

**Durum** son başarılı bakışa aittir. Son bakış eskiyse durum da eskidir; tarama turunun nerede olduğunu [İşler](/rehber/jobs) ekranında görebilirsiniz.

## Tahmini kâr nasıl hesaplanır

Bu tahmin yalnızca raporlama içindir; hiçbir fiyatı ya da alarmı etkilemez. Hesap şöyledir:

**Tahmini kâr = raf fiyatı − komisyon − kargo − operasyon − sabit satış bedeli − birim fiyat**

Raf fiyatı, buybox satıcısının kupon öncesi fiyatıdır. Tüm tutarlar olduğu gibi kullanılır.

Örnek: raf fiyatı 1.000 TL, komisyon %15 (150 TL), kargo 60 TL, operasyon 20 TL, sabit satış bedeli 13 TL ve birim fiyatınız 600 TL ise tahmini kâr 157 TL'dir.

**Zararına** etiketi, satıcının distribütörden aldığı fiyatın altında sattığı anlamına gelir. Üç olasılık vardır: satıcı malı başka bir kaynaktan buluyordur (gri piyasa), stok eritiyordur ya da tahmin girdileri (birim fiyat, desi, komisyon tarifesi) yanlıştır. Üçü de bakmaya değer. Excel dosyasındaki **Zararına** sütunu **Evet** ya da **Hayır** yazar; tahmin yapılamayan kartta boştur.

Komisyon kademeli olduğu için fiyat biraz artınca kâr düşebilir: fiyat bir üst kademeye geçince oran da artar.

Bir girdi eksikse hücrede kâr yerine nedeni yazar; üzerine gelince ne yapmanız gerektiği görünür:

| Hücrede yazan | Anlamı |
|---|---|
| **ayar yok** | [Kâr Ayarları](/rehber/brand-profit) ekranında desi tablosu ve sabit bedel kaydedilmemiş |
| **birim fiyat yok** | Stok ürününe birim fiyat girilmemiş |
| **desi yok** | Stok ürününe desi girilmemiş |
| **desi bandı yok** | Ürünün desisi, desi tablosunun hiçbir satırına düşmüyor |
| **tarife yok** | Ürünün barkoduyla eşleşen, bugün geçerli bir komisyon tarifesi yüklenmemiş ve varsayılan komisyon girilmemiş |
| **tarife dışı** | Buybox fiyatı tarifenin hiçbir kademesine düşmüyor ve varsayılan komisyon girilmemiş |
| **paket kartı** | Çarpanı 1 olmayan kartlarda kâr şimdilik hesaplanmıyor |
| **buybox yok** | Kartta okunmuş bir buybox fiyatı yok |

Bağlı olmayan favori kartta bu üç sütunda **—** görünür.

## Sık sorulanlar

**Bir kartı bu ekrana nasıl eklerim?**
Ya [Stok](/rehber/brand-products) ekranında bir ürüne bağlayın ya da [Takip Edilen Ürünler](/rehber/tracked-products) ekranında yıldızlayın.

**Durum "Bilinmiyor" yazıyor, sorun var mı?**
Karta henüz bakılmamış ya da son bakışta bilgi alınamamış olabilir. **Son bakış** sütununa ve [İşler](/rehber/jobs) ekranındaki İlanlar turuna bakın.

**Rakip markanın kartını da izleyebilir miyim?**
Evet, yıldızlayın. Kart burada görünür ama ürününüze bağlı olmadığı için aralığı ve alarmı olmaz.

**Birim buybox PSF'ye eşit görünüyor ama durum "Max üstünde". Neden?**
Birim buybox yuvarlanmış bir gösterimdir. Sistem karşılaştırmayı kuruşu kuruşuna, eşiği çarpanla çarparak yapar; birkaç kuruşluk fark aralık dışına çıkarabilir.

**Tahmini kâr hücresinde "tarife yok" yazıyor.**
Komisyon tarifesini [Kâr Ayarları](/rehber/brand-profit) ekranından yükleyin ve ürünün barkodunun Stok'ta yazılı olduğunu kontrol edin. Tarife yüklemeden tahmin görmek için Kâr Ayarları'ndaki **Varsayılan komisyon (%)** alanını doldurabilirsiniz.

<!-- kaynak: doc 17 §4.1, §5.1, §8; brand roadmap §6.7; apps/web/src/app/brand/listings/listings-client.tsx; api/tracked-products/favourite permission -->
