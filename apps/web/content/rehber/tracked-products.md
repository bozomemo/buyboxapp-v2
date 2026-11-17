---
id: tracked-products
title: Takip Edilen Ürünler
section: screens
order: 25
module: brand
routes:
  - /tracked-products
  - /tracked-products/[id]
---

**Marka Denetimi → Takip Edilen Ürünler** ekranı, izlediğiniz tüm pazaryeri kartlarını (ürün sayfalarını) listeler: [İzlenen Markalar](/rehber/watched-brands) taramasının bulduğu kartlar ve sizin link ile eklediğiniz kartlar. Her kart için fiyat, satıcı ve değerlendirme bilgisi görürsünüz. Ekran yalnızca raporlama içindir; hiçbir fiyatı etkilemez. Bir markanın hangi ürünlerinin satıldığını, kimin sattığını ve hangi kartları kendi ürünlerinize bağlayacağınızı bulmak için açın.

Rakip verisi pazaryerinin herkese açık sayfalarından toplanır. Bkz. [Rakip Verisi](/rehber/concepts-competitor-data).

## Üst bölüm

- **+ Link ile ekle**: tek bir kartı link ile takibe alır. **Ürün linki** alanına Trendyol veya Hepsiburada ürün sayfasının linkini, isterseniz **Etiket (opsiyonel)** alanına kolay tanımak için bir isim yazıp **Ekle**'ye tıklayın.
- **Sütunlar**: sütunları gösterir/gizler ve sıralarını değiştirir.
- **Excel'e Aktar**: geçerli filtreye uyan ilk 5.000 ürünü, ekranda görünen sütunlarla indirir. Yalnızca ekrandaki sayfayı değil, filtrenin tamamını indirir.

Başlığın altındaki özet satırı filtreye uyan **ürün** sayısını, izlenen **marka** ve **kategori** sayısını gösterir. Yanındaki **Tarama turu #…** çubuğu düzenli taramanın bu turda ne kadar ilerlediğini gösterir; üzerine gelince ayrıntılar (başlangıç, tahmini bitiş, önceki turun süresi) görünür.

## Filtreler

- **Ara**: ürün adı veya kodu.
- **Marka**: izlenen marka. Marka seçince **Kategori** ve **Satıcı** listeleri o markaya göre daralır.
- **Kategori**: parantez içinde kategorideki ürün sayısı yazar.
- **Satıcı**: adını yazarak bir satıcı seçin. Son 30 günde bu kartı herhangi bir anda satmış satıcılar listelenir; yanında kaç üründe görüldüğü yazar.
- **Değ. ≥**: en az bu kadar değerlendirmesi olan ürünler.
- **Satıcı ≥**: son 30 günde en az bu kadar farklı satıcısı olan ürünler.
- **Diğer**: seyrek kullanılan filtreler. Parantezdeki sayı, içinde kaç filtrenin açık olduğunu gösterir.
  - **Durum**: **Tümü**, **Aktif** ya da **Duraklatıldı**.
  - **Sadece aramada çıkanlar**: marka adıyla aramada çıkan ama pazaryerinin bu markaya atfetmediği ürünler.
  - **Değerlendirmesi olmayanlar**: pazaryerinde hiç değerlendirmesi olmayan ürünler.
  - **Satıcısızları göster**: son başarılı bakışta kimsenin satmadığı ürünler varsayılan olarak **gizlidir** (**Hayır**). **Dahil** onları da gösterir, **Sadece** yalnızca onları gösterir. Henüz hiç bakılmamış ürünler satıcısız sayılmaz ve her zaman görünür.
- **Kayıtlı**: sık kullandığınız filtreleri saklayın. Bir ad yazıp **Mevcut filtreyi kaydet…**'e tıklayın; kayda tıklayınca filtreler uygulanır, **X** ile silinir. Kayıtlar sıralamayı saklamaz.
- **Temizle**: tüm filtreleri sıfırlar; sıralamaya dokunmaz.

İzlenen Markalar ekranındaki bir sayıya tıklayıp geldiyseniz filtreler o sayıya göre önceden doldurulmuş olarak açılır.

## Sıralama

Varsayılan sıralama en çok değerlendirmesi olan ürünler en üstte olacak şekildedir; değerlendirme sayısı satış hızının en iyi göstergesidir. **Ürün**, **Kategori**, **Değerlendirme**, **Satıcı**, **Son Tarama** ve **Eklenme** başlıklarına tıklayarak sıralayabilirsiniz. Sayısal sütunlar ilk tıklamada büyükten küçüğe sıralanır.

## Sütunlar

Bazı sütunlar varsayılan olarak gizlidir; **Sütunlar** menüsünden açabilirsiniz.

- **★**: kartı favorilere ekler ya da çıkarır. Favori kartlar [Marka İlanları](/rehber/brand-listings) ekranına girer ve daha sık taranır. Kendi ürününüz olmayan bir kartı da favorileyebilirsiniz.
- **Ürün**: kartın adı; tıklayınca kartın ayrıntı sayfası açılır. **↗** pazaryerindeki sayfayı açar. **sadece arama** etiketi: ürün marka adıyla aramada çıkıyor ama pazaryeri onu bu markaya atfetmiyor. Marka adını izinsiz kullanan bir satıcı olabilir.
- **Stok Ürünü**: kartın bağlı olduğu kendi ürününüz ve çarpanı (örneğin **×3**). Tıklayınca [ürün sayfası](/rehber/brand-products) açılır. **—** ise kart bağlı değildir.
- **Marka** (gizli), **Kategori**, **Pazaryeri** (gizli), **Ürün Kodu** (gizli).
- **Değerlendirme**: değerlendirme sayısı ve parantez içinde ortalama puan. **—** ise okunamamıştır.
- **Satıcı**: son 30 günde görülen farklı satıcı sayısı.
- **Medyan** (gizli): son bakıştaki fiyatların ortancası.
- **Makas**: son bakışta en ucuz ve en pahalı satıcı arasındaki fark, yüzde olarak. %30 ve üstü turuncu yazılır. Aynı gün aynı üründe büyük makas, denetime başlanacak yerdir. Tek satıcı varsa **—**.
- **Buybox Fiyat** ve **Buybox Satıcı**: son bakışta buybox'ı tutan satıcı ve fiyatı.
- **Dönem En Düşük** / **Dönem En Yüksek** (gizli): son 30 günün en düşük ve en yüksek fiyatı. Fiyatı iki gün düşürüp geri çıkaran satıcıyı bunlar yakalar.
- **Tavsiye Fiyat**: bağlı ürününüzün PSF'si × çarpan. Bağlı olmayan kartta **—**.
- **Tavsiyeye Fark**: buybox fiyatının tavsiye fiyattan yüzde farkı. %5 veya daha fazla altındaysa turuncu yazılır.
- **Bulunma** (gizli): kartın nasıl bulunduğu: **marka id + arama**, **marka id**, **sadece arama**, **marka taraması** ya da **elle eklendi**.
- **Son Tarama**: kartın marka kataloğu taramasında en son görüldüğü zaman.
- **Son Bakış** (gizli): kartın satıcı ve fiyat bilgisinin en son okunduğu zaman.
- **Eklenme** (gizli): kartın takibe alındığı zaman.

Duraklatılmış kartlar soluk görünür.

## Satır düğmeleri

- **Tara**: bu kartın satıcı ve fiyat bilgisini hemen yeniden okur.
- **Duraklat** / **Sürdür**: kartı düzenli taramadan çıkarır ya da geri alır. Kart ve geçmişi silinmez.
- **Ürünüme bağla**: kartı kendi ürünlerinizden birine bağlar. Kart zaten bağlıysa bu düğme pasiftir.
- **Kaldır**: onay sonrası kartı takipten çıkarır.

### Bir kartı ürününüze bağlamak

1. Satırda **Ürünüme bağla**'ya tıklayın. Tablonun üstünde bir panel açılır.
2. **Stok ürünü** listesinden ürününüzü seçin. Liste boşsa önce [Marka Stok](/rehber/brand-products) ekranında ürün ekleyin.
3. **Adet çarpanı** alanına bir alışta kaç adet ürün gittiğini yazın (tekli kart için 1, üçlü paket için 3). Bu alan bilerek boş gelir.
4. **Bağla**'ya tıklayın.

## Seçili ürünleri yeniden taramak

Satırların başındaki kutuları işaretleyin (başlıktaki kutu yalnızca bu sayfadakileri seçer). Bir satır seçilince bir şerit belirir:

- **Seçilenleri Tekrar Tara**: seçilen kartları hemen yeniden okur. Tek seferde en fazla **50** ürün seçilebilir; daha fazlası seçiliyse düğme pasif olur. Bir markanın tamamı için [İzlenen Markalar](/rehber/watched-brands) ekranındaki **Şimdi tara**'yı kullanın.
- **Seçimi temizle**

Tarama kuyruğa alınır ve arka planda çalışır; tablo hemen değişmez. İlerlemeyi [İşler](/rehber/jobs) ekranından izleyin, bitince sayfayı yenileyin. Duraklatılmış bir kartı seçip tararsanız o kart da okunur.

Link ile ekleme, favori, tarama, duraklatma, bağlama ve kaldırma Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici listeyi görür ve dışa aktarabilir.

## Ürün ayrıntı sayfası

Listede bir ürün adına tıklayınca kartın tüm satıcılarını ve fiyat geçmişini gösteren sayfa açılır. Başlıkta pazaryeri, ürün kodu ve **Ürün sayfasını aç** bağlantısı bulunur; kart duraklatılmışsa **Takip duraklatıldı** etiketi görünür. **← Takip edilen ürünlere dön** listeye geri götürür.

### Şu An

**Buybox Satıcı**, **Buybox Fiyat**, **En Ucuz Teklif**, **Satıcı Sayısı**, **Toplam Görünen Stok** ve **Son Bakış**. Son bakış başarısız olduysa yanında kırmızı ⚠ ile neden yazar (**Sayfa okunamadı**, **Sayfaya ulaşılamadı**). Altındaki **son değişiklik** teklif listesinin en son ne zaman değiştiğini gösterir; fiyatlar uzun süredir sabitse bu tarih eski olabilir.

### Satıcılar

Her satır bir satıcıdır; önce şu an satanlar sırasıyla, sonra sayfadan çekilmiş olanlar gelir.

- **Sıra**: satıcının sayfadaki sırası; 1 buybox'tır.
- **Satıcı**: tıklayınca bu satıcının son 30 gündeki bakışları (tarih, sıra, fiyat, stok, kampanya) açılır. **· teklifte değil** yazan satıcı artık satmıyor; satırı bilgi olsun diye soluk olarak kalır.
- **Fiyat** ve **Değişim**: güncel fiyat ve önceki bakışa göre değişim (▲ arttı, ▼ düştü).
- **Müşteri Fiyatı**: indirim ve kuponlardan sonra müşterinin ödediği fiyat.
- **Kampanya**: satıcının kampanyası varsa adı, yoksa **yok**. **—** bilinmiyor demektir.
- **Stok**, **Puan** (satıcı puanı), **Termin** (gün olarak gönderim süresi), **Son Görülme**.

**Excel'e Aktar** satıcı listesini indirir.

### Buybox Fiyat Geçmişi

Grafik son 30 gündeki buybox fiyatını ve ikinci fiyatı gösterir. Bir noktanın üzerine gelince o anki buybox satıcısı, satıcı sayısı ve bakışın sonucu görünür. Başarısız bir bakış grafikte boşluk olarak görünür, sıfır olarak değil.

Altındaki tablo her bakışı listeler: **Bakış**, **Durum** (**Başarılı**, **Satıcı yok**, **Sayfa okunamadı**, **Sayfaya ulaşılamadı**), **Satıcı Sayısı** ve **Buybox Fiyat**. Başarısız bakışlar kırmızı satırla gösterilir.

## Sık sorulanlar

**Bir markanın ürün sayısı İzlenen Markalar'da 900 görünüyor ama burada daha az ürün var.**
Satıcısı olmayan ürünler varsayılan olarak gizlidir. **Diğer → Satıcısızları göster → Dahil** seçin.

**"Tara"ya bastım ama rakamlar değişmedi.**
Tarama kuyruğa alınır, hemen çalışmaz. [İşler](/rehber/jobs) ekranında bitmesini bekleyip sayfayı yenileyin.

**"Ürünüme bağla" düğmesi pasif.**
Kart zaten bir ürününüze bağlıdır; **Stok Ürünü** sütununda hangisine bağlı olduğu yazar. Bağı değiştirmek için o ürünün sayfasında **Bağı kaldır**'a tıklayın.

**"sadece arama" etiketi ne anlama geliyor?**
Ürün marka adınızla aramada çıkıyor ama pazaryeri onu markanıza atfetmiyor. Marka adını izinsiz kullanan bir satıcı olabilir; [Denetim Bulguları](/rehber/findings) ekranında da görünür.

**Favori ile ürüne bağlamak arasındaki fark nedir?**
İkisi de kartı [Marka İlanları](/rehber/brand-listings) ekranına koyar. Yalnızca bağlı kartın PSF'si ve fiyat aralığı alarmı olur.

<!-- kaynak: doc 06 §12.2; doc 17 §2.4, §4.1; apps/web/src/app/tracked-products/tracked-products-client.tsx, [id]/tracked-product-detail-client.tsx; components/sweep-pass-card.tsx; lib/tracked-product-discovery.ts, lib/labels.ts (STATUS_LABELS); api/tracked-products/** permissions -->
