---
id: seller-policy
title: Satıcı Politikası
section: screens
order: 27
module: brand
routes:
  - /watched-brands/policy
---

**Marka Denetimi → Satıcı Politikası** ekranında, markanızı satan satıcılardan hangilerinin **yetkili** hangilerinin **yasaklı** olduğunu kaydedersiniz. Bu kayıtlar [Denetim Bulguları](/rehber/findings) ve [Marka Satıcıları](/rehber/brand-sellers) ekranlarındaki **Politika** bilgisinin kaynağıdır. Yetkili bayi listeniz değiştiğinde ya da yeni bir satıcıyı sınıflandırmak istediğinizde açın.

Ekran yalnızca raporlama içindir. Bir satıcının yasaklı olması hiçbir fiyatı etkilemez; yalnızca kime bakmanız gerektiğini gösterir.

## Üç durum

Her satıcı, her marka için şu üç durumdan birindedir:

- **Yetkili** (yeşil): yetkili satıcınız.
- **Yasaklı** (kırmızı): markanızı satmaması gereken satıcı.
- **Tanımsız** (gri): hakkında henüz kural yazılmamış. Bu gerçek bir durumdur ve "henüz bakılmadı" demektir, "izinsiz" demek değildir. Satıcıların çoğu bu durumdadır.

Satıcılar **pazaryeri satıcı kodu** ya da **vergi numarası** ile eşleştirilir; **isimle asla**. Aynı isim aynı firma demek değildir.

Kural markaya özeldir: aynı firma bir markanızın yetkili bayisi olup diğeri için hiçbir anlaşması olmayabilir.

## Marka seçimi

Sağ üstteki **Marka** listesinden kuralları göreceğiniz markayı seçin. Markalar gruplarına göre listelenir. Hiç izlenen marka yoksa önce [İzlenen Markalar](/rehber/watched-brands) ekranından bir marka ekleyin.

## Kuralı grubun tamamına uygula

**Kuralı … tamamına uygula** kutusu işaretliyse, yazdığınız kural (elle, dosyayla ya da satırdaki düğmeyle) seçili marka yerine markanın **grubundaki tüm markalar** için geçerli olur.

- Grup kuralı, kendi kuralı olmayan her markada geçerlidir.
- Bir markaya ayrıca kural yazarsanız o marka için grup kuralı geçersiz kalır. Örneğin "grubun tamamı için yetkili, bir marka hariç yasaklı" iki kuraldır.

## Elle ekle

1. **Satıcı kodu** ya da **Vergi numarası** seçin.
2. Satıcı kodu için pazaryerini seçip kodu yazın; vergi numarası için numarayı yazın.
3. Durumu seçin: **Yetkili** ya da **Yasaklı**.
4. İsterseniz **Not** yazın.
5. **Ekle**'ye tıklayın.

Vergi numarası kuralı, o numaranın hangi mağazaya ait olduğu biliniyorsa çalışır. Henüz eşleşmediyse kural saklanır ama kimseyi etkilemez. Satıcının vergi numarasını [Marka Satıcıları](/rehber/brand-sellers#satici-kimligi) ekranındaki **Kimlik** panelinden öğrenebilirsiniz.

## Excel'den içe aktar

Yetkili bayi listenizi tek seferde yüklemek için kullanın.

- Dosya `.csv` olmalıdır. Türkçe Excel'in noktalı virgülle ayrılmış CSV'si de okunur.
- Sütunlar: **Pazaryeri**, **Satıcı Kodu** veya **Vergi No**, isteğe bağlı **Durum** ve **Not**.
- Dosyada **Durum** sütunu yoksa **Durum sütunu yoksa hepsi şu kabul edilsin:** seçimi (**Yetkili** ya da **Yasaklı**) kullanılır.

Dosyayı seçtiğiniz anda içe aktarma başlar; ayrı bir onay adımı yoktur. Sonuçta kaç satırın işlendiği, kaçının yeni ve kaçının güncelleme olduğu yazar.

Dosyada tek bir hatalı satır bile varsa **hiçbir satır yazılmaz** ve _Dosya içe aktarılmadı — hiçbir satır yazılmadı._ uyarısı altında hatalı satırlar listelenir. Yarım uygulanmış bir liste yürürlükte sanılır; bu yüzden ya hepsi ya hiçbiri yazılır. Hataları düzeltip dosyayı yeniden seçin.

## Satıcılar

Üstteki şeritte seçili markada kaç satıcının **Yetkili**, **Yasaklı** ve **Tanımsız** olduğu yazar. Şu an kimseyi etkilemeyen kural varsa (satıcı bu dönemde görülmedi ya da vergi numarası hiçbir mağazayla eşleşmiyor) sayısı da burada belirtilir. **Excel'e Aktar** listeyi indirir.

Tablo sütunları:

- **Satıcı**: satıcının adı; altında pazaryeri ve satıcı kodu, varsa kuraldaki not.
- **Vergi No**
- **Ürün**: satıcının bu markada görüldüğü ürün sayısı.
- **Piyasa sapması**: satıcının fiyatının, bulunduğu listelemelerdeki ortalama fiyattan yüzde farkı.
- **Durum**: satıcının durumu. Altında **grup kuralı** yazıyorsa karar grup kuralından gelir; **grup kuralını geçersiz kılar** yazıyorsa bu markaya özel kural grup kuralının önüne geçmiştir.
- **Değiştir**: **Yetkili**, **Yasaklı** ve **Tanımsız** düğmeleri. Satıcının durumunu tek tıkla değiştirir. Kutu işaretliyse yeni kural grubun tamamına yazılır.

**Tanımsız**'a tıklamak, satıcıya şu an uygulanan kuralı **siler**. Durum **grup kuralı** ya da bir vergi numarası kuralından geliyorsa, silinen kural gruptaki diğer markaları veya o vergi numarasına bağlı diğer mağazaları da etkiler. Tıklamadan önce **Durum** sütunundaki notu okuyun.

Kural ekleme, içe aktarma ve durum değiştirme Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Etkisiz kurallar

Bir kural hiçbir satıcıya uymuyorsa (satıcı bu dönemde görülmediyse ya da vergi numarası hiçbir mağazayla eşleşmiyorsa) sayılar satırında **… kural şu an kimseyi etkilemiyor** yazar ve altında **Etkisiz kurallar** bölümü çıkar. Bölümü açınca her kuralın durumu, satıcı kodu ya da vergi numarası, marka mı grup kuralı mı olduğu ve notu görünür. Yanlış yazılmış bir kuralı **Kuralı sil** ile silebilirsiniz; uygulama onay ister. Silmek Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Sık sorulanlar

**Yeni görünen her satıcı yetkisiz mi sayılır?**
Hayır. Yeni satıcı **Tanımsız**'dır. Yetkili listenizde olmayan satıcıları görmek için [Denetim Bulguları](/rehber/findings) ekranındaki **Yetkili listesinde yok** bulgusuna bakın.

**Excel dosyamı yükledim ama hiçbir şey değişmedi.**
Dosyada hatalı satır varsa hiçbir satır yazılmaz. Ekrandaki hata listesindeki satırları düzeltip yeniden yükleyin.

**Bir satıcıyı tüm markalarım için yetkili yapmak istiyorum.**
**Kuralı … tamamına uygula** kutusunu işaretleyip satıcıyı ekleyin. Kural gruptaki her markaya uygulanır.

**Yasaklı satıcı fiyatlarımı etkiler mi?**
Hayır. Bu ekran yalnızca raporlama içindir.

<!-- kaynak: doc 06 §12.4 (Faz 5); apps/web/src/app/watched-brands/policy/policy-client.tsx; api/seller-policies route.ts (fromGroupDefault, ruleId), import route; lib/labels.ts (POLICY_VERDICT_LABELS) -->
