---
id: stock
title: Stok
section: screens
order: 10
module: seller
routes:
  - /stock
---

Stok ekranı, sattığınız her ürünün maliyetini ve pazaryeri ayarlarını yönettiğiniz yerdir. Bu ekranın asıl sorusu şudur: **maliyetler doğru mu?** Her ilanın taban fiyatı buradaki **Birim Fiyat** üzerinden hesaplanır. Maliyeti bilinmeyen bir ürün otomatik fiyatlamaya hiç girmez. Yeni ürün eklediğinizde, maliyetleri güncellediğinizde veya bir ürünün neden fiyatlanmadığını merak ettiğinizde bu ekranı açın.

Taban fiyatın maliyetten nasıl çıktığını [Taban fiyat](/rehber/concepts-floor-price) ve [Maliyet, komisyon ve kargo](/rehber/concepts-cost-and-fees) sayfalarında bulabilirsiniz.

## Ekranın üstü

Başlığın sağında **Ürün Ekle** düğmesi vardır. Tıklayınca şu alanlar açılır:

- **Stok Kodu**: Ürünün temel stok kodu.
- **Ürün İsmi**
- **Birim Fiyat (₺, KDV dahil)**: Ürünün bir adedinin size maliyeti. Tutarı KDV dahil, olduğu gibi yazın; sistem başka bir vergi hesabı yapmaz. Kuruşu virgülle yazın, örneğin 120,50.
- **Stok Miktarı**: Elinizdeki fiziksel adet.

**Kaydet** ile ürünü ekleyin, **Vazgeç** ile formu kapatın. Kayıt olmazsa formun altında sebebi yazar.

## Stok Kalemleri

Ürünlerinizin tablosudur.

### Arama ve filtreler

- **Ara (stok kodu / ürün ismi)**: Yazdığınız metni stok kodunda veya ürün isminde arar.
- **Yalnızca maliyeti bilinmeyenler**: Yalnızca maliyeti sıfır olan, yani otomasyon dışında kalan ürünleri gösterir.
- **Yalnızca aşırı listelenenler**: Yalnızca pazaryerlerinde elinizdekinden fazla stokla satışta olan ürünleri gösterir.
- **Temizle**: Bir filtre açıkken görünür ve tüm filtreleri kaldırır.

Hiçbir satır eşleşmezse **Bu filtrelerle eşleşen stok kalemi yok.** yazar ve **Filtreleri Temizle** düğmesi çıkar.

### Sütunlar

- **Stok Kodu**
- **Ürün İsmi**
- **Birim Fiyat**: Ürünün birim maliyeti. Maliyet bilinmiyorsa kırmızı **Maliyet yok** etiketi görünür.
- **Stok Miktarı**: Fiziksel stok. Pazaryerlerindeki toplam satış stoğu bundan fazlaysa sarı **Aşırı listelenmiş** etiketi görünür.
- **… Çarpan** (her pazaryeri için ayrı, örneğin **Trendyol Çarpan**): O pazaryerinde maliyetin hangi katsayıyla çarpılacağı. Varsayılan 1'dir. Örneğin maliyeti 1.000 TL olan bir ürünün çarpanını 1,2 yaparsanız sistem o pazaryerinde maliyeti 1.200 TL kabul eder. Değeri yazıp kutudan çıktığınızda kaydedilir; kaydedilirken **Kaydediliyor…** yazar. Değer sıfırdan büyük bir sayı değilse kaydedilmez ve kutunun altında **Çarpan 1,2 gibi sıfırdan büyük bir sayı olmalı.** yazar.
- **… Oto BB** (her pazaryeri için ayrı): Bu ürünün o pazaryerinde otomatik fiyatlanıp fiyatlanmayacağı. Kutuyu işaretlediğiniz anda kaydedilir. Kayıt başarısız olursa kutu eski haline döner ve **Kaydedilemedi.** yazar.
- **… Satış Stok** (varsayılan olarak gizli): O pazaryerinde satışa açtığınız adet. Fiziksel stok varken bu pazaryerinde satışta değilse yeşil **Fırsat** etiketi görünür.
- **Kaynak** (varsayılan olarak gizli): Ürünün hangi kaynaktan geldiği.

### Satır renkleri

- **Kırmızı satır**: Maliyet bilinmiyor. Bu ürün otomatik fiyatlamadan hariç tutulur. Maliyetini düzeltin.
- **Sarı satır**: Aşırı listelenmiş. Pazaryerlerindeki toplam satış stoğu fiziksel stoktan fazla. Satılamayacak sipariş almamak için pazaryerindeki stoğu kontrol edin.

Satırın üzerine geldiğinizde aynı açıklama görünür.

### Sütun menüsü ve dışa aktarma

- Sütun menüsünden sütunları gösterebilir, gizleyebilir ve sıralayabilirsiniz. Sütun başlığının kenarını sürükleyerek genişliği değiştirebilirsiniz. Tercihleriniz bu tarayıcıda hatırlanır.
- **Excel'e Aktar**: Tüm stok listesini bir dosya olarak indirir. Ekrandaki arama ve filtreler dosyayı etkilemez; her zaman tüm ürünler gelir.

Tablonun altında sayfa geçişi vardır.

## İçe Aktarma

Başlığa tıklayınca açılır. En üstte **Yapılandırılmış kaynak** yazar; hiç kaynak yoksa **yok** görünür. Kaynağı [Ürün kaynağı](/rehber/settings-product-sources) ayarından seçersiniz.

- Kaynak **manual** ise toplu içe aktarma yoktur; ürünleri **Ürün Ekle** ile tek tek girersiniz.
- Kaynak **excel** ise bir Excel (.xlsx) dosyası seçebilirsiniz.

Excel'den içe aktarmak için:

1. Dosya seçme alanından Excel dosyanızı seçin.
2. **İlk 20 Satırı Önizle** düğmesine tıklayın. Dosyanın ilk 20 satırı stok kodu, ad, maliyet ve miktar olarak görünür. Değerlerin doğru sütunlardan okunduğunu kontrol edin.
3. **İçe Aktar** düğmesine tıklayın. Bittiğinde kaç ürünün içe aktarıldığı ve kaç satırda hata olduğu yazar.

Dosyada beklenen sütun başlıkları **KODU**, **ADI**, **Standart_Maliyet** ve **TOPLAM MIKTAR**'dır.

## Paket Düzenleyici

Başlığa tıklayınca açılır. Birden fazla ürünü birlikte satan paketleri burada tanımlarsınız. Paketin maliyeti üyelerinin maliyetlerinin toplamıdır.

- Üstte kaç paket olduğu yazar. Her paketin adı, kodu ve **… üye** sayısı listelenir.
- Paketin adına tıklayınca düzenleme açılır.
- **Yeni Paket** boş bir paket açar.
- **Paket stok kodu** alanına paketin pazaryerindeki ilanda kullandığınız stok kodunu yazın, örneğin `12345-k2`. Kod `-k` içermelidir; uygulama paketi ilana bu kodla bağlar. Bu kod sonradan değiştirilemez; var olan bir paketi açtığınızda yalnızca gösterilir.
- **Paket adı** alanına adı yazın.
- Her üye için **Üye stok kodu** ve miktarı girin. **Sil** üyeyi çıkarır, **Üye Ekle** yeni satır ekler. Üye sayısında sınır yoktur.
- **Kaydet** paketi kaydeder, **Vazgeç** değişiklikleri bırakır. Kod `-k` içermiyorsa, hiç üye yoksa ya da bir miktar 1'den küçükse paket kaydedilmez ve nedeni formun altında yazar.

## Kimler değişiklik yapabilir

Ürün eklemek, **Çarpan** ve **Oto BB** değiştirmek, içe aktarmak ve paket kaydetmek Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolü ekranı görebilir ama değişiklikler kaydedilmez. Roller için [Roller](/rehber/concepts-roles) sayfasına bakın.

## Sık sorulanlar

**Bir ürünüm hiç fiyatlanmıyor. Neden olabilir?**
Önce **Birim Fiyat** sütununda **Maliyet yok** etiketi var mı bakın. Maliyeti bilinmeyen ürün otomasyona girmez. Sonra o pazaryerinin **Oto BB** kutusunun işaretli olduğunu kontrol edin.

**Çarpanı ne zaman değiştirmeliyim?**
Bir pazaryerinde maliyetin farklı hesaplanmasını istediğinizde, örneğin o pazaryerine özel ek giderler varsa. Çarpan yükselince taban fiyat da yükselir.

**Excel'e Aktar neden filtrelediğim satırları değil, hepsini indiriyor?**
Dışa aktarma her zaman tüm stok listesini verir. Filtreler yalnızca ekranda neye baktığınızı daraltır.

**Fırsat etiketi ne anlama geliyor?**
Elinizde stok var ama ürün o pazaryerinde satışta değil. Ürünü o pazaryerinde de satmayı düşünebilirsiniz.

**Maliyete KDV eklemem gerekir mi?**
Hayır. Maliyeti KDV dahil, olduğu gibi girin. Sistem fiyat hesaplarında ayrıca vergi hesaplamaz.

<!-- kaynak: doc 06 §3, doc 01, doc 02 §0, doc 18 §6.2; apps/web/src/app/stock/stock-client.tsx, apps/web/src/app/api/stock/route.ts, apps/web/src/app/api/stock/prefs/route.ts, apps/web/src/app/api/stock/import/route.ts, apps/web/src/app/api/stock/bundles/route.ts -->
