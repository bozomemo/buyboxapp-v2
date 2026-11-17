---
id: alerts
title: Alarmlar
section: screens
order: 16
module: seller
routes:
  - /alerts
---

Alarmlar ekranı (başlıkta **Rakip Alarmları**), rakiplerle ilgili kurduğunuz kuralları ve bu kuralların şu anda açık olan alarmlarını gösterir. Örneğin "bir satıcı ürünümü 400 TL'nin altına koyarsa haber ver" gibi bir kural kurabilirsiniz. Panel'de **açık rakip alarmı** uyarısı gördüğünüzde veya yeni bir kural tanımlamak istediğinizde bu ekranı açın.

Alarmlar **raporlamadır**: hiçbir fiyat kararını tetiklemez, hiçbir fiyatı değiştirmez. Rakip verisinden üretilir ve o veri kadar günceldir. Ayrıntı için [Rakip verisi](/rehber/concepts-competitor-data).

Bir alarm tek seferlik bir bildirim değil, bir **durumdur**: koşul gerçekleştiği anda açılır, sürdüğü sürece açık kalır ve koşul ortadan kalkınca kapanır. Başarısız bir tarama alarm açmaz da kapatmaz da.

## Veri tazeliği

Sayfanın üstünde her pazaryeri için küçük bir kutu vardır: **son tarama … önce** veya **tarama yok**. Tarama gecikmişse kutu kırmızıdır.

Bir pazaryerinde veri bayatsa en üstte kırmızı **Bu alarmlar güncel veriye dayanmıyor** uyarısı çıkar. Her pazaryeri için son başarılı taramanın ne zaman olduğu ve kaç başarısız deneme olduğu yazar. Bu durumda alarm görünmemesi "sorun yok" anlamına gelmez, "bakmadık" anlamına gelir. [İşler](/rehber/jobs) ekranından **Rakip Verisi Toplama** işini kontrol edin.

## Açık alarmlar

Başlıkta açık alarm sayısı yazar. **Excel'e Aktar** açık alarmları dosya olarak indirir; dosyadaki zamanlar tam tarih ve saattir.

Her alarm sarı bir kartta görünür:

- Üstte kuralın adı.
- Ürün adı: Tıklayınca [ilan detayı](/rehber/listings#ilan-detayi) açılır.
- Pazaryeri, **bizim fiyatımız** ve alarm açıldığında kullanılan **eşik**.
- Sağda **başlangıç** (alarmın ne zaman açıldığı) ve **son görülme** (koşulun en son ne zaman doğrulandığı).
- **… satıcı eşiğin altında**: Alarma sebep olan satıcıların tablosu:
  - **Satıcı**: Tıklayınca [Satıcı Sayfası](/rehber/seller-detail) açılır. Pazaryeri kimlik vermemişse **(kimliksiz)** yazar.
  - **Fiyat**: Satıcının fiyatı. Yanında karşılaştırmada hangi fiyatın kullanıldığı yazar: **kupon** (müşterinin ödeyeceği indirimli fiyat) veya **liste**. Hepsiburada kupon fiyatını yayınlamadığı için orada hep **liste** yazar.
  - **Sıra**
  - **Bu alarma katıldığı**: Satıcının bu alarma ne zaman dahil olduğu.
  - **Promosyon**: Satıcının promosyon bilgisi.
- Alarmdan ayrılan satıcı varsa **… satıcı bu alarmdan ayrıldı (geçmişte tutuluyor).** yazar.

Aynı üründe birden fazla satıcı kuralı ihlal ederse tek bir alarm açılır ve satıcılar bu alarmın altında listelenir.

Açık alarm yoksa şunlardan biri yazar:

- **Henüz alarm kuralı tanımlanmamış.** Kural tanımlanmadan hiçbir koşul izlenmez.
- **Açık alarm yok.** Veri bayatsa altında bunun "sorun yok" anlamına gelmediği yazar.

## Kurallar

Başlıkta kural sayısı yazar. **Listeyi göster** / **Listeyi gizle** kural listesini açıp kapatır.

Her kuralda adı, kısa bir açıklaması (örneğin "Tüm ürünler · Herhangi bir satıcı, 400 TL altında fiyat verirse") ve sessizlik süresi görünür. Kapalı kurallarda **pasif** etiketi vardır. Sabit eşikli kurallarda **Sabit eşik — piyasa buradan uzaklaştıysa bu kural sessizce ölmüş olabilir.** hatırlatması çıkar; bu kuralları ara sıra gözden geçirin.

Her kuralın yanında:

- **düzenle**: Kuralı düzenleme formunda açar.
- **pasifleştir** / **etkinleştir**: Kuralı kapatır veya açar.
- **sil**: Kuralı siler. Onay ister. Bu kurala bağlı açık alarmlar da silinir.

### Yeni kural oluşturma

1. **+ Yeni kural** düğmesine tıklayın.
2. **Kural adı** yazın, örneğin "Sahte ürün şüphesi — 400 TL altı".
3. **Hangi ürünlerde?** seçin:
   - **Tüm ürünler**
   - **Bir pazaryerindeki tüm ürünler**: Altından pazaryerini seçin.
   - **Tek bir ilan**: **Ürün adı ya da stok kodu ile ara…** alanına en az iki harf yazıp listeden ürünü seçin. **değiştir** seçimi kaldırır.
   - **Bir stok kodundaki tüm ilanlar**: Stok kodunu yazın.
4. **Hangi satıcı?** seçin:
   - **Herhangi bir satıcı**
   - **Belirli bir satıcı**: Listeden seçin. Liste, rakip verisinde görülmüş satıcılardan oluşur.
   - **Bir satıcı grubu**: Listeden seçin. Gruplar [Satıcı Sayfası](/rehber/seller-detail#kimlik-esleme)'nda oluşturulur.
5. **Ne olursa?** seçin:
   - **ilanda görünürse**: Satıcı ilanda göründüğü anda alarm açılır.
   - **şu eşiğin altında fiyat verirse**: Ardından **Eşik** seçin.
6. **Eşik** (yalnızca fiyat kurallarında):
   - **Sabit fiyat**: Tutarı TL olarak yazın. Kuruş için virgül kullanın, örneğin 400,50. Altında **Kaydedilecek eşik** olarak nasıl okunduğunu görürsünüz; kaydetmeden önce kontrol edin. Anlaşılmayan bir tutarda **Anlaşılmadı** yazar ve kaydedemezsiniz.
   - **Bizim fiyatımız**: Satıcı sizin fiyatınızın altına inerse.
   - **Taban fiyatımız**: Satıcı ilanın **Min** fiyatının altına inerse. Min fiyatı girilmemiş ilanlarda bu kural değerlendirilemez; alarm ne açar ne kapatır.
   - **Bizim fiyatımızdan yüzde aşağısı**: Yüzdeyi yazın, örneğin 5. Satıcı sizin fiyatınızın yüzde 5 altına inerse alarm açılır.
7. **Sessizlik süresi** seçin: Kapanan bir alarmın aynı ürün için yeniden açılması için beklenecek süredir. Fiyatı eşiğin etrafında gidip gelen bir rakip yüzünden alarm sürekli açılıp kapanmasın diye kullanılır. Açık alarmı susturmaz. **Yok — koşul her tekrarında yeni alarm** seçeneği bekleme olmadığı anlamına gelir.
8. **Etkin** kutusunun işaretli olduğundan emin olun.
9. **Kaydet** düğmesine tıklayın. **Vazgeç** formu kapatır.

Sistem, hiçbir zaman tetiklenemeyecek bir kuralı kaydetmez; örneğin yanlış yazılmış bir stok kodu veya hiç görülmemiş bir satıcı. Bu durumda formun üstünde sebebi yazar.

### Kimler kural yönetebilir

Kural oluşturmak, düzenlemek, pasifleştirmek ve silmek Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolü alarmları ve kuralları görebilir, ama değişiklikler kaydedilmez.

## Sık sorulanlar

**Hiç alarm yok. Her şey yolunda mı?**
Önce sayfanın üstündeki veri tazeliğine bakın. Kırmızı **Bu alarmlar güncel veriye dayanmıyor** uyarısı varsa sistem rakiplere yakın zamanda bakamamıştır. Uyarı yoksa ve kurallarınız etkinse, şu anda hiçbir kural koşulu karşılanmıyor demektir.

**Alarm açıldı. Sistem fiyatımı değiştirecek mi?**
Hayır. Alarmlar yalnızca raporlamadır. Fiyatınızı değiştirmek isterseniz alarmın ürün bağlantısından ilan detayına gidin.

**Aynı alarm sürekli açılıp kapanıyor. Ne yapabilirim?**
Kuralı **düzenle** ile açın ve **Sessizlik süresi**'ni uzatın, örneğin 6 saat veya 1 gün.

**"Taban fiyatımız" eşikli kuralım hiç alarm üretmiyor. Neden?**
Bu eşik ilanın **Min** fiyatını kullanır. İlanda Min fiyatı yoksa kural değerlendirilemez. [İlanlar](/rehber/listings) ekranında **Min/Max** sütununu kontrol edin.

**Belirli bir satıcı listede çıkmıyor. Neden?**
Satıcı listesi, rakip verisinde daha önce görülmüş satıcılardan oluşur. Satıcı henüz hiç görülmediyse listede olmaz.

<!-- kaynak: doc 06 §6.2, doc 18 §6.2; apps/web/src/app/alerts/alerts-client.tsx, apps/web/src/app/api/alerts/rules/route.ts, apps/web/src/lib/labels.ts, packages/jobs/src/pipeline/evaluate-alerts.ts -->
