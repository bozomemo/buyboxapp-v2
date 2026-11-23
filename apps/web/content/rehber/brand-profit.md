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
- **Varsayılan komisyon (%)**: geçerli bir komisyon tarifesi olmayan ürünlerde kullanılacak oran (ör. 15 ya da 15,5). İsteğe bağlıdır. Ayrıntılar aşağıda, [Varsayılan komisyon](/rehber/brand-profit#varsayilan-komisyon) bölümünde.
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

## Varsayılan komisyon

Komisyon tarifesi yüklemediyseniz ya da bazı ürünler tarifeyle eşleşmiyorsa, **Varsayılan komisyon (%)** alanına bir oran yazıp **Kaydet**'e tıklayın. Bu oran şu ürünlerde, fiyat ne olursa olsun aynen kullanılır:

- Hiç tarife yüklenmemişse bütün ürünlerde.
- Tarife dönemi geçerli değilse: süresi dolmuş ya da henüz başlamamış.
- Barkodu Stok'ta yazılı olmayan ya da dosyadaki barkodla eşleşmeyen ürünlerde.
- Buybox fiyatı tarifenin hiçbir kademesine düşmüyorsa.

Bir ürünün bugün geçerli bir tarifesi varsa her zaman tarife kullanılır; varsayılan oran onun yerine geçmez. [İlanlar](/rehber/brand-listings) ekranında varsayılan oranla hesaplanan satırlarda komisyonun yanında **varsayılan** yazar.

Örnek: varsayılan komisyon %15, tarife yüklenmemiş. Raf fiyatı 1.000 TL olan üründe komisyon 150 TL alınır.

- Değer 0 ile 100 arasında olmalı ve en çok iki ondalık içerebilir. Ondalık için virgül kullanın (15,5). "1.5" gibi noktalı yazım kabul edilmez.
- Alanı boş bırakırsanız varsayılan kullanılmaz; tarifesi olmayan ürünlerde eskisi gibi **tarife yok** yazar.
- Paket kartlarında (çarpanı 1 olmayan) varsayılan oran da kullanılmaz; kâr yine hesaplanmaz.

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
O ürünün barkodu Stok ekranında yazılı olmayabilir ya da dosyadaki barkodla aynı olmayabilir. Tarife döneminin **geçerli** olduğunu da kontrol edin. Bu ürünlerde de kâr görmek istiyorsanız **Varsayılan komisyon (%)** alanını doldurun.

**Varsayılan komisyon girdim; tarifesi olan ürünler de bu oranla mı hesaplanıyor?**
Hayır. Geçerli tarifesi olan üründe her zaman tarifedeki oran kullanılır.

**Komisyon tarifesi her satıcı için gerçekten aynı mı?**
Sistem öyle kabul eder. Bir satıcının tarifeye katılıp katılmadığı bilinemez; bu yüzden sonuç bir tahmindir.

**Bu ayarlar fiyatlarımı ya da alarmları etkiler mi?**
Hayır. Yalnızca İlanlar ekranındaki tahmini kâr sütunlarını etkiler.

<!-- kaynak: doc 17 §8, §8.1, §8.2; apps/web/src/app/brand/profit/profit-client.tsx; api/brand/profit-settings, api/brand/commission-tariffs permissions -->
