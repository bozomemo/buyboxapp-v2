---
id: listings
title: İlanlar
section: screens
order: 11
module: seller
routes:
  - /listings
  - /listings/[id]
---

İlanlar ekranı, pazaryerlerindeki her ilanınızın fiyatını, buybox durumunu ve otomasyon ayarlarını gördüğünüz ana çalışma ekranıdır. Bir ilanın fiyatını kontrol etmek, elle fiyat göndermek, otomasyonu açıp kapatmak veya bir fiyatın neden öyle olduğunu anlamak istediğinizde buraya gelin. Bir ilanın adına tıklayınca o ilanın [detay sayfası](/rehber/listings#ilan-detayi) açılır.

## Liste ekranı

### Üst kısım

- Sütun menüsü: Sütunları gösterir, gizler ve sıralar. Başlığın kenarını sürükleyerek genişliği değiştirebilirsiniz. Tercihleriniz bu tarayıcıda hatırlanır.
- **Excel'e Aktar**: Geçerli filtreyle eşleşen ilanları dosya olarak indirir. En fazla ilk 5.000 ilan iner.

### Filtreler

- **Pazaryeri**: **Tümü**, **Trendyol** veya **Hepsiburada**.
- **Marka**: Bir markanın ilanlarını gösterir. Parantez içinde markanın ilan sayısı yazar. Pazaryeri seçiliyse yalnızca o pazaryerinin markaları listelenir. [Markalar](/rehber/brands) ekranından bir markaya tıklayarak da gelebilirsiniz.
- **Ara (ürün adı / stok kodu / SKU)**: Ürün adında, stok kodunda veya pazaryeri SKU'sunda arar.
- Faz düğmeleri: **Arıyor**, **Tırmanıyor**, **İnceltiyor**, **Optimum**, **Bloke**. Bir veya birkaçını seçebilirsiniz. Seçili düğme dolu renkte görünür.
- **Satılabilir**, **Kilitli**, **Otomasyon**, **Gözlem**, **Kara Liste**: Her biri için **herhangi**, **evet** veya **hayır** seçin.
- **Temizle**: Bir filtre açıkken görünür ve tüm filtreleri kaldırır.

Panel'deki faz kutularına tıklayarak gelirseniz faz filtresi hazır seçili gelir.

**Kayıtlı filtreler**: Sık kullandığınız bir filtreyi saklayabilirsiniz.

1. Filtreleri istediğiniz gibi ayarlayın.
2. **Yeni kayıt adı** alanına bir ad yazın.
3. **Filtreyi kaydet** düğmesine tıklayın.

Kayıtlı filtrenin adına tıklayınca o filtre uygulanır. Yanındaki çarpı (**Bu kaydı sil**) kaydı siler. Kayıtlı filtreler bu tarayıcıda saklanır. Marka seçimi kayıtlı filtreye dahil edilmez.

### Sütunlar

- **Pazaryeri**
- **Ürün Adı**: Tıklayınca ilan detayı açılır. Başlığına tıklayarak sıralayabilirsiniz.
- **Stok Kodu**: İlanın bağlı olduğu temel stok kodu.
- **Dip Fiyat**: Bu ilanın altına inilmeyecek taban fiyatı. Hesaplanamıyorsa kırmızı **Maliyet yok** etiketi görünür; bu durumda maliyet veya ücret ayarları eksiktir. Ayrıntı için [Taban fiyat](/rehber/concepts-floor-price).
- **Satış Fiyatı**: Şu anki fiyatınız. Başlığına tıklayarak sıralayabilirsiniz. Fiyata tıklayarak elle fiyat gönderebilirsiniz (aşağıda).
- **Sıra**: Pazaryerinde kaçıncı sırada olduğunuz. 1. sıradaysanız hücre yeşildir.
- **Buybox Fiyatı**: Buybox'ı tutan teklifin fiyatı.
- **Buybox Mağaza**: Buybox'ı tutan mağazanın adı. Bu bilgi rakip verisinden gelir ve yalnızca raporlama içindir; henüz veri yoksa **—** görünür.
- **Faz**: İlanın fiyatlandırma aşaması. Ayrıntı için [Yeniden fiyatlandırma](/rehber/concepts-repricing).
- **Satış Stok**: Pazaryerinde satışa açık adet.
- **Min/Max**: Bu ilan için alt ve üst fiyat sınırı. Değeri yazıp kutudan çıktığınızda kaydedilir.
- **Oto BB**: Bu ilan otomatik fiyatlansın mı.
- **Gözlem**: Bu ilan için buybox bilgisi okunsun mu. Otomasyondan bağımsızdır; otomasyonu kapalı bir ilanı da gözlemleyebilirsiniz.

Bir anahtar değişmezse yanında kırmızı **!** çıkar. Üzerine gelince **Değişmedi.** yazar.

### Satır renkleri

- **Kırmızı**: Zararına satış (satış fiyatı dip fiyatın altında) veya maliyet bilinmiyor.
- **Gri**: İlan kilitli veya askıda.
- **Sarı**: Faz **Bloke**; kârlı bir fiyatla rekabet edilemiyor.
- **Yeşil**: Buybox alınabilir; dip fiyatınız buybox fiyatının altında ama buybox sizde değil.

### Elle fiyat gönderme

1. **Satış Fiyatı** sütunundaki fiyata tıklayın.
2. **Yeni fiyat** alanına fiyatı yazın, örneğin 1250.
3. **Gönder** düğmesine tıklayın.
4. Çıkan uyarıda eski ve yeni fiyatı kontrol edip **Onayla** düğmesine tıklayın. **Vazgeç** ile iptal edebilirsiniz.

Elle gönderilen fiyat, otomatik kararlarla aynı yoldan pazaryerine gider. Elle fiyat gönderdiğinizde bu ilanın otomasyonu bir süre duraklatılır; böylece sistem fiyatınızı hemen değiştirmez. Fiyat, ilanın **Min** fiyatının altındaysa kabul edilmez ve **Fiyat, ilanın belirlenen minimum fiyatının altında.** uyarısı çıkar.

### Toplu işlemler

Satırların başındaki kutularla ilan seçin. Başlıktaki kutu o sayfadaki tüm ilanları seçer. Seçim yapınca **… ilan seçildi** çubuğu çıkar:

- **Otomasyonu Aç**: Onay ister.
- **Otomasyonu Kapat / Hariç Tut**: Hemen uygular.
- **Gözlemi Aç** ve **Gözlemi Kapat**: Hemen uygular.
- **Yeniden Optimize Et**: Seçili ilanların fiyatlamasını sıfırdan başlatır (faz **Arıyor** olur). Onay ister.

### Kimler değişiklik yapabilir

Elle fiyat göndermek, **Min/Max**, **Oto BB** ve **Gözlem** değiştirmek ve toplu işlemler Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolünde fiyat düz metin olarak görünür, kutular soluktur ve toplu işlem çubuğu çıkmaz.

## İlan detayı

Bir ilanın adına tıklayınca açılır. Başlıkta ürün adı, altında pazaryeri, pazaryeri ilan numarası ve satıcı stok kodu yazar. **← İlanlara dön** listeye geri götürür. Bu sayfanın amacı, ilanın şu anki fiyatını kayıtlara bakmadan açıklayabilmektir.

### Şu An

- **Satış Fiyatı**, **Dip Fiyat**, **Stok**.
- **Durum**: **Satılamaz**, **Kara Liste**, **Kilitli**, **Askıda** etiketleri. Hiçbiri yoksa **Sorun yok** yazar.
- **Fiyat Şelalesi**: Dip fiyatın nasıl oluştuğunu adım adım gösterir: **Maliyet**, **+Kargo/Gider**, **+Komisyon** ve sonuçta **Dip Fiyat**. Örneğin maliyet 800 TL, kargo ve giderler 60 TL, komisyon 140 TL ise dip fiyat 1.000 TL olur. Tüm tutarlar KDV dahildir. Ayrıntı için [Maliyet, komisyon ve kargo](/rehber/concepts-cost-and-fees).
- Altında satış fiyatının dip fiyatın ne kadar üzerinde olduğu yazar.
- **Elle Fiyat Gönder**: Yeni fiyatı yazıp **Gönder** düğmesine tıklayın ve onaylayın. Bu, otomasyonu geçici olarak duraklatır.

### Rekabet

- Üstte **Sıra**, **Buybox** fiyatı ve verinin ne kadar önce okunduğu yazar.
- Grafik: Zaman içinde **Buybox**, **2. Fiyat** ve **Bizim Fiyatımız** çizgileri. Grafiğin üzerinde gezinince o anki fiyatları, **Buybox satıcı** adını ve **Sıramız**'ı gösterir. Veri olmayan aralıklarda çizgi kesilir. Bizim fiyatımız kesikli düz bir çizgidir ve yalnızca şu anki fiyatı gösterir; geçmiş fiyatlarınız **Fiyat Geçmişi** tablosundadır.
- Teklif tablosu: **Sıra**, **Satıcı**, **Fiyat**, **Müşteri Fiyatı**, **Puan**, **Kargo Süresi**, **Stok**. Kayıt yoksa **Kayıtlı rakip teklifi yok.** yazar.
- **Excel'e Aktar**: Teklif tablosunu indirir.

Rakip bilgisi yalnızca raporlama içindir ve fiyat kararlarını etkilemez. Ayrıntı için [Rakip verisi](/rehber/concepts-competitor-data).

### Motor

- **Faz**: İlanın fiyatlandırma aşaması.
- **Son İyi Fiyat**: Buybox'ı elde tuttuğunuz gözlenen en yüksek fiyat.
- **Son Kötü Fiyat**: Buybox'ı kaybettiğiniz gözlenen en düşük fiyat.
- **Optimum Fiyat**: Bulunan en kârlı fiyat.
- **Duraklatma Bitişi**: Otomasyonun ne zaman yeniden devreye gireceği (örneğin elle fiyat gönderdikten sonra).
- **Ardışık Ret**: Pazaryerinin arka arkaya kaç gönderimi reddettiği.
- Altta son kararın sebebi ve açıklaması yazar, örneğin **Buybox için fiyat düşürüldü**.

Motor henüz karar üretmediyse **Bu ilan için motor henüz bir karar üretmedi.** yazar.

Düğmeler:

- **Yeniden Optimize Et**: Fiyatlamayı baştan aramaya döndürür. Onay ister.
- **Otomasyonu Duraklat**: Bu ilanın otomasyonunu hemen kapatır.
- **Otomasyonu Sürdür**: Otomasyonu yeniden açar. Onay ister.
- **Min Fiyat**, **Max Fiyat** ve **Sınırları Kaydet**: İlanın fiyat sınırlarını kaydeder. Sistem bir sonraki kararda bu sınırlara uyar.

Bu düğmeler Yönetici ve Fiyat Yöneticisi rollerine açıktır; İzleyici rolünde soluk görünür.

### Fiyat Geçmişi

Bu ilan için yapılmış tüm fiyat gönderimleridir. Aylar sonra bile bir fiyatın neden verildiğini buradan anlayabilirsiniz.

- **Karar Zamanı**: Tam tarih ve saat.
- **Eski → Yeni**
- **Sebep**: Kararın sebebi. Üzerine gelince açıklaması görünür.
- **Kim**: Elle gönderimlerde gönderen kullanıcının adı; otomatik kararlarda **Sistem**.
- **Durum**: **Kuyrukta**, **Gönderildi**, **Onaylandı**, **Başarısız**, **Reddedildi** veya **İptal edildi**.
- **Dip Fiyat**, **Buybox**, **Sıra**: Karar anındaki değerler.
- **Hata**: Gönderim başarısızsa pazaryerinin verdiği hata.

**Excel'e Aktar** tabloyu indirir.

## Sık sorulanlar

**Satır kırmızı. Ne yapmalıyım?**
Önce **Dip Fiyat** sütununa bakın. **Maliyet yok** yazıyorsa ürünün maliyetini [Stok](/rehber/stock) ekranında, ücret ayarlarını [Ücretler](/rehber/settings-fees) ayarında kontrol edin. Dip fiyat görünüyorsa ilan zararına satılıyordur.

**Elle fiyat gönderdim ama sistem fiyatı değiştirmedi. Neden?**
Elle gönderim, ilanın otomasyonunu bir süre duraklatır. İlan detayındaki **Duraklatma Bitişi** bu sürenin ne zaman biteceğini gösterir.

**İlan Bloke fazında. Bu ne demek?**
Bu ilan için kârlı bir fiyat mümkün değil; rakipler dip fiyatınızın altında satıyor olabilir. Sistem fiyatı dip fiyatın altına indirmez.

**Gönderimin pazaryerine ulaşıp ulaşmadığını nasıl anlarım?**
İlan detayındaki **Fiyat Geçmişi** tablosunun **Durum** sütununa bakın. **Onaylandı** pazaryerinin fiyatı kabul ettiğini gösterir. **Başarısız** veya **Reddedildi** ise sebebi **Hata** sütunundadır.

**Neden fiyat hücresine tıklayamıyorum?**
Fiyat değiştirmek Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolünde fiyat yalnızca görüntülenir.

<!-- kaynak: doc 06 §4, §5, doc 02 §0, doc 03, doc 18 §6.2; apps/web/src/app/listings/listings-client.tsx, apps/web/src/app/listings/[id]/listing-detail-client.tsx, apps/web/src/app/api/listings/[id]/manual-price/route.ts, apps/web/src/app/api/listings/bulk/route.ts, apps/web/src/lib/labels.ts -->
