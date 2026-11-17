---
id: brand-profit
title: Kâr Ayarları
section: screens
order: 23
module: brand
routes:
  - /brand/profit
---

**Marka Denetimi → Kâr Ayarları** ekranında, [İlanlar](/rehber/brand-listings) ekranındaki **Tahmini kâr** sütununun ürüne bağlı olmayan girdilerini girersiniz: sabit satış bedeli, desi tablosu ve komisyon tarifesi. Ürüne bağlı girdiler (birim fiyat ve desi) [Marka Stok](/rehber/brand-products) ekranındadır. Bu ayarlar yalnızca raporlama içindir; hiçbir fiyatı ya da alarmı değiştirmez. Kurulumdan sonra bir kez, sonra da kargo ücretleri veya komisyon dönemi değiştiğinde açın.

Kaydetme ve tarife yükleme Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici ayarları görebilir ama kaydedemez.

## Sabit bedel ve desi tablosu

Ayarlar henüz hiç kaydedilmediyse kartın üstünde _Henüz kaydedilmedi — kaydedilene kadar İlanlar'da kâr tahmini gösterilmez._ uyarısı çıkar. Bu durumda İlanlar'da **ayar yok** yazar. Sistem varsayılan bir tablo kullanmaz.

- **Sabit satış bedeli (₺, her satış için)**: pazaryerinin her satıştan aldığı sabit bedel.
- **Desi tablosu**: her satır bir desi aralığıdır.
  - **Desi üst sınırı**: bu satırın geçerli olduğu en yüksek desi. Satırlar artan sırada olmalıdır. Son satırın üst sınırını boş bırakırsanız "bundan büyük her desi" anlamına gelir.
  - **Kargo (₺)**: satıcının o koli için ödediği kargo bedeli.
  - **Operasyon (₺)**: o koli için tahmini personel, depolama ve paketleme maliyeti.
  - **+ Satır ekle** yeni satır ekler, **Kaldır** satırı siler. Tek satır kaldıysa silinemez.

Tutarları ekranda yazdığı gibi, KDV dahil girin. Değişiklikleri **Kaydet** ile kaydedin.

Örnek tablo:

| Desi üst sınırı | Kargo (₺) | Operasyon (₺) |
|---|---|---|
| 2 | 55 | 15 |
| 5 | 85 | 25 |
| (boş) | 140 | 40 |

Desisi 4 olan bir ürün ikinci satıra düşer: kargo 85 TL, operasyon 25 TL. Ürünün desisi hiçbir satıra düşmüyorsa İlanlar'da **desi bandı yok** yazar.

## Komisyon tarifesi

Trendyol satıcı panelindeki **Komisyon Tarifeleri** ekranından indirilen Excel dosyasını burada yükleyin. Dosyada her ürün için fiyat kademeleri ve her kademenin komisyon oranı vardır. Tarife her satıcı için aynı kabul edilir.

1. Dosyayı Trendyol'dan indirin ve **değiştirmeden** saklayın.
2. **Dosya** alanında dosyayı seçin (`.xlsx` veya `.csv`).
3. **Önizle**'ye tıklayın. Bu adımda hiçbir şey kaydedilmez.
4. Özeti kontrol edin:
   - **Ürün**: dosyadaki ürün sayısı.
   - **Stok ürünüyle eşleşen**: barkodu Stok ekranındaki bir ürününüzle eşleşenler.
   - **Alınmayacak satır**: okunamayan satırlar. Altındaki tabloda **Satır** ve **Sorun** yazar.
   - **Dönem**: tarifenin geçerli olduğu tarih aralığı.
5. **… ürünün tarifesini yükle**'ye tıklayın.

Dikkat edilecekler:

- Ürünler, Stok ekranındaki ürününüzün **barkodu** ile eşleşir. Barkodu olmayan ürün için İlanlar'da **tarife yok** yazar.
- Dosyadaki dönemde yıl yazmaz; yıl yükleme tarihine göre belirlenir. Önizlemedeki tarihleri mutlaka kontrol edin.
- Aynı dönemi yeniden yüklerseniz öncekinin yerine geçer.

### Yüklü dönemler

Bu tablo yüklenmiş tarife dönemlerini gösterir: **Dönem**, **Ürün** sayısı, **Durum** ve **Yüklendi** zamanı. **Durum** şunlardan biridir:

- **geçerli**: bugün bu dönemin içindeyiz; kâr tahmini bu tarifeyi kullanır.
- **başlamadı**: dönem henüz başlamadı.
- **süresi doldu** (turuncu): dönem bitti, artık kullanılmaz. Yeni dönemin dosyasını yükleyin.

Hiç tarife yüklenmediyse İlanlar'da **tarife yok** yazar.

## Sık sorulanlar

**İlanlar'da tüm satırlarda "ayar yok" yazıyor.**
Bu ekranda sabit bedel ve desi tablosu hiç kaydedilmemiş. Değerleri girip **Kaydet**'e tıklayın.

**Tarifeyi yükledim ama bazı ürünlerde hâlâ "tarife yok" yazıyor.**
O ürünün barkodu Stok ekranında yazılı olmayabilir ya da dosyadaki barkodla aynı olmayabilir. Tarife döneminin **geçerli** olduğunu da kontrol edin.

**Komisyon tarifesi her satıcı için gerçekten aynı mı?**
Sistem öyle kabul eder. Bir satıcının tarifeye katılıp katılmadığı bilinemez; bu yüzden sonuç bir tahmindir.

**Bu ayarlar fiyatlarımı ya da alarmları etkiler mi?**
Hayır. Yalnızca İlanlar ekranındaki tahmini kâr sütunlarını etkiler.

<!-- kaynak: doc 17 §8, §8.1, §8.2; apps/web/src/app/brand/profit/profit-client.tsx; api/brand/profit-settings, api/brand/commission-tariffs permissions -->
