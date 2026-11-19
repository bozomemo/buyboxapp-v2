---
id: competitors
title: Rakip Geçmişi
section: screens
order: 13
module: seller
routes:
  - /competitors
---

Rakip Geçmişi, ürünlerinizde hangi rakiplerin ne zaman satışta olduğunu, buybox'ı kimin ne kadar tuttuğunu ve rakip verisinin ne kadar düzenli toplandığını gösteren bir rapor ekranıdır. "Bu ürüne yeni bir satıcı ne zaman girdi?", "Geçen ay buybox en çok kimdeydi?" gibi soruları yanıtlamak için açın.

Rakip verisi **yalnızca raporlama içindir**. Fiyat kararlarını etkilemez. Ayrıntı için [Rakip verisi](/rehber/concepts-competitor-data).

Bu ekran yalnızca görüntüleme içindir; her rol kullanabilir.

## Filtreler

Filtreyi değiştirdiğiniz anda rapor yenilenir; yenilenirken **Güncelleniyor…** yazar.

- **Başlangıç** ve **Bitiş**: Raporun tarih aralığı. Varsayılan son 30 gündür.
- **Pazaryeri**: **Tümü**, **Trendyol** veya **Hepsiburada**.
- **Stok Kodu**: Yalnızca bu temel stok koduna bağlı ilanları gösterir.
- **Satıcı kodu**: Bir rakip satıcının pazaryerindeki kimlik numarasını yazın. Bu numarayı [Rakip Satıcılar](/rehber/competitor-sellers) ekranında bulabilirsiniz. Bir satıcı seçtiğinizde **Satıcı Profili** bölümü çıkar.
- **İlan (fiyat zaman çizelgesi için)**: **Ürün adı ara…** alanına yazın ve çıkan listeden bir ilan seçin. Tek bir ilan seçtiğinizde **Fiyat Zaman Çizelgesi** görünür ve **Buybox Payı** süreye göre hesaplanır. **İlan Filtresini Kaldır** seçimi kaldırır.

Seçilen aralıkta 20.000'den fazla gözlem varsa **Gözlem sayısı 20.000 sınırını aştı — sonuçlar kesildi. Tarih aralığını daraltın.** uyarısı çıkar. Bu durumda tarih aralığını kısaltın.

## Fiyat Zaman Çizelgesi

Yalnızca bir ilan seçtiğinizde görünür.

- **Zaman**: Gözlemin tarihi ve saati.
- **Buybox Fiyatı**: O anda buybox'taki fiyat.
- **Sıra**: O anda sizin sıranız.

Altında **Fiyat değişikliklerimiz** satırında, aynı dönemde sizin yaptığınız fiyat değişiklikleri tarih ve eski→yeni fiyatla listelenir. **CSV İndir** tabloyu indirir.

## Tarama kapsamı kutusu

Raporun üstündeki bu kutu, aşağıdaki rakamların ne kadar veriye dayandığını söyler. Bir rakamı yorumlamadan önce buna bakın.

- **Tarama**: Kaç denemenin başarılı olduğu, örneğin **120 başarılı / 130 deneme**.
- **Başarısız**: Başarısız deneme sayısı ve oranı. Oran yüzde 25 veya üstündeyse kutu sarı olur.
- **Ortalama aralık**: Başarılı taramalar arasında ortalama kaç saat geçtiği.
- **Son başarılı tarama**: En son başarılı taramanın tarihi.

Son başarılı taramanın üzerinden 24 saatten fazla geçtiyse **Veri bayat** uyarısı çıkar: rakamlar bugünü değil, son başarılı taramanın anını anlatır.

Dönemde hiç tarama yoksa kırmızı **Bu dönemde hiç tarama yapılmamış.** kutusu çıkar. Bu durumda rakamlar "rakip yok" değil, "bakmadık" anlamına gelir. Rakip verisi toplama işi varsayılan olarak kapalıdır; [İşler](/rehber/jobs) ekranından açılabilir.

## Satıcı Varlığı (Giriş/Çıkış)

Hangi satıcının hangi üründe ne zaman görüldüğünü gösterir.

- **Ürün**
- **Satıcı**
- **İlk Görülme (≥)**: Satıcının bu üründe ilk görüldüğü gözlem. "≥" işareti, satıcının en geç bu tarihte satışa başladığını gösterir; daha önce de satıyor olabilir ama o zaman bakılmamıştır.
- **Son Görülme**: Satıcının en son görüldüğü gözlem.
- **Gözlem**: Satıcının bu üründe kaç gözlemde görüldüğü.

Eşleşen kayıt yoksa **Filtreyle eşleşen kayıt yok.** yazar. **CSV İndir** tabloyu indirir.

Buradaki bilgiler satıcının ürünü **listelediğini** gösterir; satış yaptığını göstermez.

## Buybox Payı

Buybox'ın hangi satıcıda ne kadar olduğunu gösterir. İki şekilde hesaplanır:

- **İlan seçili değilse**: Her satıcının kaç gözlemde buybox'ta olduğu sayılır. Sütunlar **Satıcı**, **Buybox Anı** ve **Pay**'dır. Bu sayım süreyi hesaba katmaz.
- **Tek bir ilan seçiliyse**: Zaman ağırlıklı hesaplanır. Her gözlem bir sonraki gözleme kadar geçen süre kadar sayılır. Sütunlar **Satıcı**, **Tuttuğu Süre** ve **Pay**'dır. Hiç gözlem olmayan süreler hesaba katılmaz; bu süre tablonun altında ayrıca yazılır. Bu sürede buybox'ı kimin tuttuğu bilinmez.

**CSV İndir** gösterilen tabloyu indirir.

## Satıcı Profili

Yalnızca **Satıcı kodu** filtresi doluysa ve o satıcıya ait gözlem varsa görünür. Başlıkta satıcının adı yazar.

- **Görüldüğü Ürün**: Satıcının sizin ürünlerinizden kaçında görüldüğü.
- **Ortalama Sıra**: Satıcının ortalama sırası.
- **Kampanyalı Gözlem**: Satıcının kampanyalı fiyatla görüldüğü gözlem sayısı.
- **Aktiflik**: Satıcının ilk ve son görüldüğü zaman.

## Gözlem Kapsamı

Gün gün tarama sonuçlarını gösterir. Verinin hangi günlerde zayıf olduğunu buradan görürsünüz.

- **Tarih**
- **Başarılı**: Başarılı tarama sayısı.
- **Ayrıştırma Hatası**: Sayfaya ulaşılan ama okunamayan tarama sayısı. Sıfırdan büyükse sarı görünür.
- **Getirme Hatası**: Sayfaya hiç ulaşılamayan tarama sayısı. Sıfırdan büyükse kırmızı görünür.

Seçilen aralıkta kayıt yoksa **Seçilen aralıkta tarama kaydı yok.** yazar. **CSV İndir** tabloyu indirir.

## Sık sorulanlar

**Tablolar boş. Bu, rakibim olmadığı anlamına mı geliyor?**
Hayır, her zaman değil. Önce tarama kapsamı kutusuna bakın. **Bu dönemde hiç tarama yapılmamış** veya **Veri bayat** yazıyorsa sistem rakiplere bakamamıştır.

**Buybox Payı neden ilan seçince değişiyor?**
İlan seçili değilken pay gözlem sayısına göre hesaplanır. Tek ilan seçince buybox'ın tutulduğu süreye göre hesaplanır. Süreye göre pay daha doğrudur ama yalnızca tek ilan için hesaplanabilir.

**Rakip verisi fiyatlarımı etkiler mi?**
Hayır. Rakip verisi yalnızca raporlama içindir. Fiyat kararları pazaryerinin resmi buybox bilgisine göre verilir.

**İlk Görülme tarihi satıcının satışa başladığı tarih mi?**
Kesin değil. Satıcı o tarihte ilk kez görülmüştür; ondan önceki taramada yoksa o aralıkta bir zamanda satışa başlamıştır.

<!-- kaynak: doc 06 §6, doc 08 §12; apps/web/src/app/competitors/competitors-client.tsx, apps/web/src/app/competitors/coverage-badge.tsx, apps/web/src/app/api/competitors/route.ts -->
