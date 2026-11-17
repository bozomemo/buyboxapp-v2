---
id: watched-brands
title: İzlenen Markalar
section: screens
order: 24
module: brand
routes:
  - /watched-brands
---

**Marka Denetimi → İzlenen Markalar** ekranı, pazaryerlerinde ürünlerini izlemek istediğiniz markaların listesidir. Bir markayı buraya eklediğinizde o markanın pazaryerindeki **bütün** ürünleri bulunur ve [Takip Edilen Ürünler](/rehber/tracked-products) listesine girer. Bu ekran yalnızca raporlama içindir; hiçbir fiyatı etkilemez. Yeni bir marka eklerken ve taramaların sağlıklı ilerleyip ilerlemediğini kontrol ederken açın.

Rakip verisi yalnızca raporlama içindir. Bkz. [Rakip Verisi](/rehber/concepts-competitor-data).

## Gruplar ve markalar

Markalar **gruplar** altında tutulur. Bir grup birden çok marka içerebilir; örneğin bir üretici şirketin sahip olduğu birkaç marka aynı grupta durur. Her grup ekranda ayrı bir tablo olarak görünür. Grup başlığının yanındaki **Grubu sil**, grubu ve altındaki markaları onay sonrası siler.

Bir marka iki yolla aranır:

- **Arama terimi**: pazaryerinde bu kelimeyle arama yapılır.
- **Marka id**: pazaryerinin markaya verdiği numara.

İkisi de verilirse ikisi de taranır. Arama terimiyle çıkıp marka id'siyle çıkmayan bir ürün, marka adını izinsiz kullanıyor olabilir; bu fark bir denetim bulgusudur.

## Marka veya grup ekleme

**Marka veya grup ekle** düğmesi ekleme formunu açar (**Ekleme formunu gizle** kapatır). Hiç grup yoksa form kendiliğinden açılır. Ekleme Yönetici ve Fiyat Yöneticisi rollerine açıktır.

1. **Yeni marka grubu** alanına grubun adını yazıp **Grup Ekle**'ye tıklayın.
2. Marka eklemek için **Grup**'u ve **Pazaryeri**'ni seçin.
3. **Marka adı** alanına markanın adını yazın.
4. **Arama terimi**'ni ve biliyorsanız **Marka id (opsiyonel)**'yi yazın. İkisinden en az biri gereklidir.
5. **Marka Ekle**'ye tıklayın.

Marka id'sini bilmiyorsanız boş bırakın. İlk taramadan sonra sistem, bulunan ürünlerin çoğunun taşıdığı marka id'sini **Nasıl aranıyor** sütununda önerir.

Aynı markayı Trendyol ve Hepsiburada için ayrı ayrı eklersiniz.

## Sütunlar

**Sütunlar** menüsünden sütunları gizleyebilir ve sıralarını değiştirebilirsiniz. Sütun kenarını sürükleyerek genişliği ayarlayabilirsiniz.

- **Marka**: markanın adı. Tıklayınca Takip Edilen Ürünler bu markaya filtrelenmiş olarak açılır.
- **Pazaryeri**
- **Nasıl aranıyor**: **marka id: …** ve/veya **arama: …**. Sistem bir marka id önerirse **+ marka id … ekle** bağlantısı görünür; üzerine gelince ürünlerin yüzde kaçının bu id'yi taşıdığını görürsünüz. Tıklayınca id markaya eklenir.
- **Tür**: **bizim** ya da **rakip**. Tıklayarak değiştirirsiniz.
  - **bizim**: kendi markanız. Denetim bulguları (yetkisiz satıcı, tavsiye fiyat altı satış vb.) üretilir.
  - **rakip**: rakip marka. Aynı şekilde taranır ve fiyatları karşılaştırılır, ama denetim bulgusu üretilmez.
  - **bizim**'den **rakip**'e geçerken onay istenir, çünkü bulgular bundan sonra durur.
- **Ürün**: markada bulunan ürün sayısı. Tıklayınca ürünler açılır. **(… değerlendirmesiz)** pazaryerinde hiç değerlendirmesi olmayan ürün sayısıdır; tıklayınca yalnızca onlar açılır.
- **Satıcısız**: son başarılı bakışta kimsenin satmadığı ürün sayısı (turuncu). Tıklayınca bu ürünler açılır. **(+… bakılmadı)** henüz hiç bakılmamış ürünlerdir; bunlar satıcısız değil, bilinmiyor demektir.
- **Son Tarama**: markanın kataloğunun en son ne zaman tarandığı. **henüz taranmadı** ise hiç taranmamıştır.
- **Durum**: **aktif** ya da **duraklatıldı**. Tıklayarak değiştirirsiniz. Duraklatılan marka düzenli taramaya girmez.

**Excel'e Aktar** tüm markaları gruplarıyla birlikte dosya olarak indirir.

## Satır düğmeleri

- **Şimdi tara**: önce markanın kataloğunu tarar, sonra bulunan **her ürünün satıcılarını** tek tek okur. Her ürün tek tek sorgulandığı için büyük bir markada saatler sürebilir. Onay ister ve arka planda çalışır.
- **Sadece katalog**: yalnızca markada hangi ürünlerin olduğunu bulur; satıcı ve buybox verisi toplamaz. Çok daha hızlıdır.
- **Kaldır**: markayı izleme listesinden çıkarır. Bulunan ürünler ve geçmişleri silinmez; yalnızca markayla bağları kalkar.

İki tarama düğmesi de işi kuyruğa alır; ilerlemeyi [İşler](/rehber/jobs) ekranından izlersiniz. Tarama başlatma, tür ve durum değiştirme ile kaldırma Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Ölü ürün önerisi

Bir markanın ürünlerinin önemli bir kısmının pazaryerinde hiç değerlendirmesi yoksa bu kutu görünür. Değerlendirme sayısı satış hızının elimizdeki en iyi göstergesidir; hiç değerlendirmesi olmayan ürün büyük olasılıkla satmıyor.

Her satırda marka, toplam ürün, değerlendirmesiz ürün sayısı ve oranı, ayrıca bu ürünler duraklatılırsa satıcı taramasının ne kadar kısalacağı (**derin tarama … dk → … dk**) yazar.

**Duraklat**'a tıklayınca kaç ürünün duraklatılacağı sorulur. Ürünler **silinmez**; listede kalır ve [Takip Edilen Ürünler](/rehber/tracked-products) ekranından istediğiniz zaman sürdürebilirsiniz. Çok sayıda ürün varsa her seferinde bir kısmı işlenir; kalanlar için tekrar tıklayın. Bu işlem Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Sık sorulanlar

**Markayı ekledim ama ürün görünmüyor.**
Ekleme taramayı başlatmaz. **Şimdi tara** ya da **Sadece katalog**'a tıklayın ve [İşler](/rehber/jobs) ekranından ilerlemeyi izleyin.

**"Şimdi tara" ile "Sadece katalog" arasındaki fark nedir?**
**Sadece katalog** yalnızca ürün listesini günceller ve hızlıdır. **Şimdi tara** ayrıca her ürünün satıcılarını ve fiyatlarını okur; büyük bir markada saatler sürer.

**Rakip markayı neden "rakip" olarak işaretlemeliyim?**
Yetkili satıcı ve tavsiye fiyat kuralları yalnızca kendi markanız için anlamlıdır. **rakip** markada fiyatlar izlenir ama gereksiz denetim bulgusu üretilmez.

**Bir markayı kaldırırsam ürün geçmişi kaybolur mu?**
Hayır. Ürünler ve geçmişleri kalır; yalnızca markayla bağları kalkar.

<!-- kaynak: doc 06 §12.4; api-references §1.7 (meaning only); apps/web/src/app/watched-brands/watched-brands-client.tsx; api/watched-brands/**, api/tracked-products/prune-suggestion permissions -->
