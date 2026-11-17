---
id: competitor-sellers
title: Rakip Satıcılar
section: screens
order: 14
module: seller
routes:
  - /competitors/sellers
---

Rakip Satıcılar ekranı, sattığınız ürünlerde karşınıza çıkan satıcıları listeler. Liste, sizinle en çok üründe çakışan satıcıdan başlar; yani "en çok kiminle rekabet ediyoruz?" sorusunun cevabı listenin en üstündedir. Bir rakibin hangi ürünlerinizde olduğunu ve nasıl fiyat verdiğini görmek için bir satıcının adına tıklayın; [Satıcı Sayfası](/rehber/seller-detail) açılır.

Bu ekrandaki veriler pazaryerinde görülen **tekliflerden** gelir. Bir satıcının ürünü kaç kez **listelediğini** gösterir, kaç adet sattığını göstermez. Rakip verisi yalnızca raporlama içindir ve fiyat kararlarını etkilemez. Ayrıntı için [Rakip verisi](/rehber/concepts-competitor-data).

Bu ekran yalnızca görüntüleme içindir; her rol kullanabilir.

## Filtreler

- **Dönem**: **Son 7 gün**, **Son 30 gün** veya **Son 90 gün**. Varsayılan son 30 gündür.
- **Pazaryeri**: **Tümü**, **Trendyol** veya **Hepsiburada**.

Filtre değişince liste yenilenir; yenilenirken **Güncelleniyor…** yazar.

## Tarama kapsamı kutusu

Listenin üstündeki kutu, rakamların ne kadar veriye dayandığını söyler: **Tarama** (başarılı / deneme), **Başarısız**, **Ortalama aralık** ve **Son başarılı tarama**. Son başarılı tarama 24 saatten eskiyse **Veri bayat** uyarısı çıkar. Dönemde hiç tarama yoksa **Bu dönemde hiç tarama yapılmamış.** yazar; bu "rakip yok" değil, "bakmadık" demektir. Kutunun ayrıntısı [Rakip Geçmişi](/rehber/competitors#tarama-kapsami-kutusu) sayfasında anlatılır.

## Kendi mağazanız

Sizin mağazanız da kendi ilanlarınızda bir teklif olarak görülür. Bu ekran sizi rakip listesinden çıkarır ve ayrı bir satırda gösterir:

- **Kendi mağazamız** (rakip listesinden çıkarıldı): Her pazaryeri için kaç üründe görüldüğünüz ve kaç kez buybox'ta olduğunuz.

Sistem kendi mağazanızı tanıyamazsa kırmızı **Kendi mağazanız bu listede rakip olarak görünüyor.** uyarısı çıkar. Her pazaryeri için sebebi yazar:

- **satıcı referansı tanımlı değil**: O pazaryeri için satıcı kimliğiniz girilmemiş.
- **tanımlı satıcı referansı (…) bu pazaryerinin tekliflerinde hiç görülmedi**: Girilen kimlik yanlış olabilir.

Bu durumda uyarıdaki **Pazaryerleri** bağlantısına tıklayın ve [Pazaryerleri](/rehber/settings-marketplaces) ayarında **Satıcı Referansı** alanını düzeltin. Sistem mağazanızı isme göre eşleştirmez; yalnızca bu kimliğe bakar.

## Kimliği bilinmeyen teklifler

Bazı tekliflerde pazaryeri satıcı kimliği vermez. Bu teklifler listede yer almaz ve sarı bir kutuda sayıları yazar. Sistem bu teklifleri isme göre bir satıcıya bağlamaz, çünkü aynı isim aynı firma anlamına gelmeyebilir.

## Satıcı listesi

Tablonun üstünde sütun menüsü ve **Excel'e Aktar** düğmesi vardır. Sütun menüsüyle sütunları gizleyip gösterebilir, başlık kenarını sürükleyerek genişliği değiştirebilirsiniz. **Excel'e Aktar** listenin tamamını indirir.

- **Satıcı**: Satıcının adı. Tıklayınca [Satıcı Sayfası](/rehber/seller-detail) açılır. Satıcı bir gruba atanmışsa adının yanında grup adı, bir not girilmişse altında not görünür.
- **Pazaryeri**
- **Ürünümüz**: Bu satıcının sizin kaç ürününüzde görüldüğü. Liste bu sütuna göre sıralanır.
- **Teklif**: Dönem içinde bu satıcıdan kaydedilen teklif sayısı.
- **Buybox**: Satıcının kaç teklifte buybox'ta olduğu; parantez içinde oranı.
- **Ort. sıra**: Satıcının ortalama sırası.
- **Fiyat aralığı**: Satıcının dönem içinde verdiği en düşük ve en yüksek fiyat.
- **İlk görülme**: Satıcının ilk görüldüğü gözlem. Önünde **≥** işareti vardır: satıcı bu tarihten önce de orada olabilir ama o zaman fark edilmemiş olabilir. Bu bir satışa başlama tarihi değildir.
- **Son görülme**: Satıcının en son görüldüğü gözlem.

Hiç kayıt yoksa **Bu dönemde kayıtlı rakip teklifi yok.** yazar. Bu durumda dönemi veya pazaryerini genişletin ya da tarama işinin açık olduğunu [İşler](/rehber/jobs) ekranından kontrol edin.

## Sık sorulanlar

**Kendi mağazam listenin en üstünde rakip olarak görünüyor. Neden?**
Sistem mağazanızı tanıyamıyor. Kırmızı uyarıdaki **Pazaryerleri** bağlantısından **Satıcı Referansı** alanını pazaryerinin verdiği satıcı numarasıyla doldurun.

**Liste boş. Rakibim yok mu?**
Önce tarama kapsamı kutusuna bakın. **Bu dönemde hiç tarama yapılmamış** yazıyorsa sistem rakiplere hiç bakmamıştır.

**Trendyol'daki ve Hepsiburada'daki aynı firmayı nasıl birleştiririm?**
Satıcının adına tıklayın ve [Satıcı Sayfası](/rehber/seller-detail#kimlik-esleme)'ndaki **Grup** alanından iki kimliği aynı gruba atayın. Sistem bunu isim benzerliğinden kendisi yapmaz.

**Teklif sayısı satış sayısı mı?**
Hayır. Teklif, satıcının o ürünü listelediğinin görüldüğü bir gözlemdir. Satış adedi bu ekranda yoktur.

<!-- kaynak: doc 06 §6, §6.1; apps/web/src/app/competitors/sellers/sellers-client.tsx, apps/web/src/app/competitors/coverage-badge.tsx, apps/web/src/app/api/competitors/sellers/route.ts -->
