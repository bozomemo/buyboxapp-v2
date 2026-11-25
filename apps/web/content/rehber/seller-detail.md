---
id: seller-detail
title: Satıcı Sayfası
section: screens
order: 15
module: null
routes:
  - /competitors/sellers/[marketplace]/[ref]
---

Satıcı Sayfası, tek bir satıcının sizin ürünlerinizde ve izlediğiniz markaların ürünlerinde ne yaptığını gösterir. [Rakip Satıcılar](/rehber/competitor-sellers) veya [Marka Satıcıları](/rehber/brand-sellers) listesinde bir satıcının adına tıkladığınızda, ya da bir denetim bulgusundan geldiğinizde açılır. Bu sayfada aynı firmanın farklı pazaryerlerindeki kimliklerini bir gruba da toplayabilirsiniz.

Bir satıcı iki ayrı kayıtta görülebilir ve ikisi farklı soruyu yanıtlar:

- **Sattığımız ürünlerde**: Bu satıcı sizin ilanlarınızın sayfalarında ne yapıyor? Bu bölüm yalnızca Satış modülü açıksa görünür.
- **İzlenen marka ürünlerinde**: Bu satıcı izlediğiniz markaların ürünlerinde ne yapıyor? Bu ürünleri sizin satmanız gerekmez.

Bir marka sahibi için genellikle ikinci bölüm doludur, birincisi boştur. Bu bir veri eksikliği değildir; o firmayla ortak sattığınız ürün olmadığı anlamına gelir.

Rakip verisi yalnızca raporlama içindir. Ayrıntı için [Rakip verisi](/rehber/concepts-competitor-data).

## Ekranın üstü

- Başlıkta satıcının adı, altında pazaryeri ve satıcının pazaryerindeki kimlik numarası yazar. Satıcı bir gruptaysa **Grup:** adı ve gruptaki pazaryeri kimliği sayısı da görünür.
- **← Rakip satıcılar** (veya Satış modülü kapalıysa **← Marka satıcıları**): Listeye geri döner.
- **Dönem**: **Son 7 gün**, **Son 30 gün** veya **Son 90 gün**. Bir denetim bulgusundan geldiyseniz dönem o bulgunun dönemine ayarlıdır ve hiçbir düğme seçili görünmez.

Satış modülü açıksa altında tarama kapsamı kutusu bulunur. Kutunun anlamı [Rakip Geçmişi](/rehber/competitors#tarama-kapsami-kutusu) sayfasında anlatılır.

## Kimlik eşleme

Pazaryerleri satıcılara kendi kimlik numaralarını verir. Trendyol'daki bir numara ile Hepsiburada'daki aynı numara birbiriyle ilgisizdir. İki kimliğin aynı firmaya ait olduğunu yalnızca siz bilebilirsiniz. Sistem bunu isim benzerliğinden asla tahmin etmez, çünkü yanlış bir birleştirme alarmların yanlış firma için çalışmasına yol açar.

Bir satıcıyı gruba atamak için:

1. **Grup** listesinden mevcut bir grubu seçin. Seçtiğiniz anda kaydedilir.
2. Uygun grup yoksa **Yeni grup oluştur** alanına bir ad yazın (örneğin **Olympus Grup**) ve **Oluştur** düğmesine tıklayın. Sonra yeni grubu **Grup** listesinden seçin.
3. Aynı firmanın diğer pazaryerindeki satıcı sayfasını açıp aynı grubu orada da seçin.

Gruptan çıkarmak için **Grup** listesinden **— gruplanmamış —** seçin. Kaydedilirken **Kaydediliyor…** yazar. Gruplama Yönetici ve Fiyat Yöneticisi rollerine açıktır; İzleyici rolünde bu alanlar soluk görünür.

Satıcı henüz kalıcı olarak kaydedilmemişse sarı bir kutu çıkar ve gruplama yapılamaz. Bir tarama çalıştıktan sonra tekrar deneyin.

Gruplama Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Sattığımız ürünlerde

Yalnızca Satış modülü açıksa görünür. Bu satıcının sizin ilanlarınızın sayfalarında görüldüğü teklifleri özetler.

Üstteki kartlar:

- **Çakıştığımız ürün**: Bu satıcıyla ortak sattığınız ürün sayısı.
- **Kayıtlı teklif**: Toplam teklif sayısı.
- **Buybox'ta görüldüğü**: Satıcının kaç teklifte buybox'ta olduğu ve oranı.

Tablo sütunları:

- **Ürün**: Ürün adı ve stok kodu. Tıklayınca [ilan detayı](/rehber/listings#ilan-detayi) açılır.
- **Bizim fiyatımız**: Sizin şu anki fiyatınız.
- **Onun fiyat aralığı**: Satıcının dönem içindeki en düşük ve en yüksek fiyatı.
- **Teklif**, **Buybox**, **Ort. sıra**
- **İlk görülme** (≥ ile) ve **Son görülme**

Sütun menüsü ve **Excel'e Aktar** tablonun üstündedir. Hiç ortak ürün yoksa **Bu dönemde bu satıcıyla çakıştığımız bir ürün yok.** yazar.

## İzlenen marka ürünlerinde

İzlediğiniz markaların ürünlerinde bu satıcının görüldüğü teklifleri özetler. Bu ürünleri sizin satmanız gerekmez.

- **Marka**: Varsayılan **Tüm izlenen markalar**'dır. Tek bir marka seçerek daraltabilirsiniz. Bir denetim bulgusundan geldiyseniz bulgunun markası seçili gelir.

Üstteki kartlar: **Görüldüğü ürün**, **Kayıtlı teklif**, **Buybox'ta görüldüğü**.

Tablo sütunları:

- **Ürün**: Tıklayınca takip edilen ürünün sayfası açılır.
- **Onun fiyat aralığı**
- **Piyasa sapması**: Satıcının fiyatının aynı sayfadaki diğer tekliflerden ortalama yüzde kaç farklı olduğu. Eksi değer piyasanın altında demektir. Yüzde 15 veya daha fazla altındaysa sarı görünür. Üzerine gelince kaç bakışa dayandığı yazar. Karşılaştırılabilir bakış yoksa **—** görünür.
- **Teklif**
- **Buybox**: Buybox'ta görüldüğü sayı ve oranı.
- **En ucuz**: Sayfadaki en ucuz teklif olduğu sayı ve oranı. Buybox'tan ayrıdır, çünkü pazaryeri buybox'ı yalnızca fiyata göre vermez.
- **İlk görülme** (varsayılan olarak gizli) ve **Son görülme**

Satıcı çok fazla üründe görüldüyse yalnızca en son görülenler listelenir ve bir uyarı çıkar; daraltmak için bir marka seçin. Hiç kayıt yoksa, marka kataloğu taramasının açık olup olmadığını [İzlenen Markalar](/rehber/watched-brands) ekranından kontrol edin.

Marka denetiminin ayrıntıları için [Marka Satıcıları](/rehber/brand-sellers) ve [Denetim Bulguları](/rehber/findings) sayfalarına bakın.

## Sık sorulanlar

**"Sattığımız ürünlerde" bölümü boş, ama satıcı izlenen markalarda görünüyor. Veri mi kayıp?**
Hayır. Bu satıcı sizin sattığınız ürünlerde görülmemiş, yalnızca izlediğiniz markaların ürünlerinde görülmüş demektir.

**Aynı firmanın iki pazaryerindeki hesabını nasıl birleştiririm?**
Her iki satıcı sayfasında da **Grup** listesinden aynı grubu seçin. Grup yoksa önce **Yeni grup oluştur** ile oluşturun.

**Grup seçtim ama kaydedilmedi. Neden?**
Gruplama Yönetici ve Fiyat Yöneticisi rollerine açıktır; İzleyici rolünde seçim kaydedilmez ve sayfanın üstünde bir hata yazar. **Grup** alanı hiç görünmüyorsa satıcı henüz kalıcı olarak kaydedilmemiştir; sarı kutu bunu söyler.

**Piyasa sapması neden bazı satırlarda boş?**
O dönemde bu ürün için karşılaştırma yapılabilecek bir bakış yoktur; örneğin sayfada başka satıcı bulunmuyordur.

<!-- kaynak: doc 06 §6.1, §12.4, doc 17 §1.3; apps/web/src/app/competitors/sellers/[marketplace]/[ref]/seller-detail-client.tsx, apps/web/src/app/competitors/coverage-badge.tsx, apps/web/src/app/api/competitors/sellers/group/route.ts -->
