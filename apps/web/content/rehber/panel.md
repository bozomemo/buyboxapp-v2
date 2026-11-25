---
id: panel
title: Panel
section: screens
order: 1
module: null
routes:
  - /
---

Panel, uygulamayı açtığınızda gördüğünüz ilk ekrandır. Tek bir soruyu yanıtlar: **sistem çalışıyor mu ve güvenli mi?** Bir şey yolunda değilse ne yapmanız gerektiğini ve hangi ekrana gitmeniz gerektiğini de söyler. Gün içinde sistemin durumunu kontrol etmek istediğinizde buraya bakın.

Panel kendini 30 saniyede bir yeniler. Kurulumunuzda hangi modüllerin açık olduğuna göre farklı bölümler gösterir:

- **Satış modülü** açıksa: fiyat gönderimi anahtarı, **Pazaryerleri**, **İlanlar Ne Durumda** ve **Son Fiyat Değişiklikleri** bölümleri görünür.
- **Marka modülü** açıksa: en üstte marka özet kartları ve sayfanın altında **Marka Denetimi** bölümü görünür.
- İki modül de açıksa ikisinin bölümleri birlikte görünür. Durum özeti, **Dikkat Gerekenler**, **Güvenlik Anahtarları** ve **Sistem Günlüğü** her kurulumda vardır.

Modülleri [Modüller](/rehber/settings-modules) ayarından yönetirsiniz.

## Üst çubuk

Üst çubuk her ekranın en üstünde aynıdır. Soldan sağa şunları içerir:

- **Tarama tazeliği**: Her pazaryeri için son başarılı taramanın ne kadar önce yapıldığını gösteren küçük etiketler, örneğin **Trendyol · 5dk önce**. Tarama gecikmişse etiket sarı olur ve **gecikmeli** yazar. Hiç tarama yapılmamışsa **henüz taranmadı** yazar. Etiket iki dakikada bir yenilenir.
- **Yeni sürüm … hazır**: Yeni bir sürüm indirilip kurulmaya hazır olduğunda görünür. Tıklayınca [Güncelleme](/rehber/settings-update) ayarına gider. Bu bağlantıyı yalnızca Yönetici rolü görür.
- **Güncelleme geri alınamadı — fiyat işleri durduruldu**: Bir güncelleme başarısız olup geri alınamadığında herkese kırmızı olarak görünür. Bu durumda fiyat işleri durmuştur. Tıklayıp [Güncelleme](/rehber/settings-update) ekranına bakın ve kurulumu yapan kişiyle iletişime geçin.
- **Satış / Marka / Tümü**: Yalnızca iki modül de kuruluysa görünür. Soldaki menüde hangi grubun gösterileceğini seçer. Bu yalnızca bir görünüm tercihidir; hiçbir işi açmaz veya durdurmaz. Seçiminiz bu tarayıcıda hatırlanır.
- **?** düğmesi (**Bu ekranın rehberi**): Açık olan ekranın rehber sayfasını açar.
- **Açık / Koyu / Sistem**: Ekranın renk temasını seçer.
- **Genel durdurma düğmesi**: Sistemdeki tüm işleri durdurur veya devam ettirir. Ayrıntısı aşağıda.

Lisans süresi dolmuş ama ek süre içindeyseniz, üst çubuğun üstünde sarı bir şerit çıkar: **Lisans süresi doldu. Sistem … gün sonra duracak.** **Şimdi yenile** bağlantısı [Lisans](/rehber/license) ekranını açar.

### Genel durdurma düğmesi

Düğme iki durumdan birini gösterir:

- **Genel Durdurma: Duraklatıldı** (gri): Hiçbir iş çalışmıyor. İçe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi durmuştur. Kurulum Sihirbazı bitene kadar sistem bu durumda bekler.
- **Sistem Çalışıyor** (yeşil): İşler normal şekilde çalışıyor.

Yeşil düğmeye tıklarsanız sistem hemen duraklatılır, onay sorulmaz. Gri düğmeye tıklarsanız sistemi devam ettirmek istediğinizden emin olup olmadığınız sorulur. Onay verdiğinizde tüm işler yeniden başlar.

Fiyat gönderiminin kendi ayrı anahtarı vardır ve Panel'deki **Güvenlik Anahtarları** bölümündedir. Sistem çalışırken fiyat gönderimi kapalı olabilir.

Bu düğmeyi kullanma yetkisi Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolünde düğme soluk görünür ve üzerine geldiğinizde **Bu işlem için yetkiniz yok** yazar.

Sistem durumu okunamazsa düğmenin yerinde **Sistem durumu alınamadı — Tekrar dene** yazar. Tıklayarak yeniden deneyin.

Durdurma anahtarlarının farkını [Otomasyon ve durdurma](/rehber/concepts-automation-and-stop) sayfasında bulabilirsiniz.

### Sol menü

Sol menü üç gruptan oluşur: **Satış**, **Marka Denetimi** ve **Sistem**. Kapalı olan modülün grubu gösterilmez. Menünün altında adınız ve rolünüz görünür. Rolünüz yalnızca görüntülemeye izin veriyorsa yanında **Salt okunur** etiketi çıkar. Adınıza tıklayınca [Hesabım](/rehber/account) açılır; çıkış simgesi oturumu kapatır. En alttaki düğme menüyü daraltır veya genişletir. Sayfa ilk açılırken menüde modül öğelerinin yerinde birkaç gri satır görünür; açık modüller okununca öğeler o yere gelir.

Telefonda (dar ekranda) sol menü gizlidir. Üst çubuğun solundaki **☰** (**Menüyü aç**) düğmesi menüyü sayfanın üstünde açar; **✕** ya da menü dışına dokunmak kapatır. Bir sayfaya geçince menü kendiliğinden kapanır.

## Durum özeti

Sayfanın en üstündeki renkli kutu sistemin durumunu tek cümleyle söyler:

- **Her şey yolunda** (yeşil): İşler çalışıyor, müdahale gerektiren bir şey yok.
- **Çalışıyor — bakılması gereken … konu var** (sarı): Sistem ilerliyor, ama **Dikkat Gerekenler** listesinde bekleyen konular var.
- **Sistem düzgün çalışmıyor** (kırmızı): Ciddi bir sorun var. Giderilene kadar fiyatlandırma (veya marka taramaları) güvenilir şekilde ilerlemez.
- **Sistem duraklatıldı** (gri): Genel durdurma açık. Bu bir arıza değildir.

Kutunun altında üç küçük etiket her zaman görünür:

- **İşler: çalışıyor / duraklatıldı**
- **Fiyat gönderimi: AÇIK / kapalı** (yalnızca satış modülünde)
- **Worker: çalışıyor / durmuş**: Arka planda işleri yürüten hizmetin durumu.

Sağ üstte **Son güncelleme** saati ve **Yenile** düğmesi vardır. Bir yenileme başarısız olursa ekranda **Son yenileme başarısız oldu** uyarısı çıkar; altındaki bilgiler en son başarılı okuma saatine aittir.

## Marka özet kartları

Marka modülü açıksa ve izlenen bir marka ya da fiyat bandı izlemesi varsa durum özetinin altında şu kartlar görünür:

- **Fiyat bandı ihlali**: Açık fiyat bandı alarmlarının sayısı. Veri güncel değilse yanında **Veri güncel değil** yazar; alarm yoksa ve veri eskiyse sayı yerine **?** görünür, çünkü "bakılmadı" ile "sorun yok" aynı şey değildir. **Aç →** ile [Marka alarmları](/rehber/brand-alerts) açılır.
- **Açık bulgu**: Açık denetim bulgularının toplamı; **kesin bilgi** ve **yorum** olarak ikiye ayrılır. Bu sayı arka planda hesaplanır; yanında en son ne zaman hesaplandığı yazar (örneğin **2sa 05dk önce hesaplandı**). Bir markanın satıcı taraması bittiğinde o markanın bulguları hemen yeniden hesaplanır; bunun dışında altı saatte bir hesaplanır. Hiç hesaplanmadıysa **henüz hesaplanmadı** yazar. **Aç →** ile [Denetim Bulguları](/rehber/findings) açılır; o ekran bulguları her açılışta yeniden hesapladığı için sayı burada kısa bir süre farklı görünebilir.
- **Satıcısı olmayan ürün**: Hiçbir satıcının satmadığı ürün sayısı. Bazı ürünlere henüz bakılmadıysa bunu ayrıca yazar; bu durumda sayı eksik olabilir.
- **Tavsiye fiyat kapsamı**: Tavsiye fiyatı (PSF) yüklenmiş ürünlerin oranı.
- **Takip edilen ürün**: Takip edilen ürün ve marka sayısı.

## Dikkat Gerekenler

Bugün sizin müdahale etmeniz gereken konuların listesidir. Her satırda **Sorun** (kırmızı) veya **Dikkat** (sarı) etiketi, kısa bir açıklama ve konuyu çözeceğiniz ekrana giden bir düğme bulunur. Liste boşsa **Şu an müdahale gerektiren bir şey yok.** yazar.

Görebileceğiniz başlıca satırlar:

- **Veritabanına ulaşılamıyor** veya **Veritabanı şeması bu sürümle uyuşmuyor**: [Veritabanı](/rehber/settings-database) ayarına gidin.
- **Worker çalışmıyor**: Kuyruktaki işleri alacak hizmet çalışmıyor. [İşler](/rehber/jobs) ekranına bakın.
- **Sistem uyarısı**: Sistemin kendi sağlık kontrolünden gelen uyarı.
- **Etkin pazaryeri yok**: [Pazaryerleri](/rehber/settings-marketplaces) ayarından pazaryeri ekleyin.
- **Rakip verisi bayat**: Bir pazaryerinde son başarılı rakip taramasının üzerinden çok zaman geçti. Bu durumda alarm görünmemesi "sorun yok" anlamına gelmez.
- **… açık rakip alarmı**: Kurduğunuz alarm kurallarından biri tetiklendi. [Alarmlar](/rehber/alerts) ekranına gidin.
- **…: günlük güncelleme bütçesi doldu**: O pazaryerine bugün başka fiyat gönderilmeyecek. Gerekirse [Politika](/rehber/settings-policy) ayarından artırın.
- **Son kararların … tanesi pazaryerine geçmedi**: Fiyat hesaplandı ama gönderim başarısız oldu ya da reddedildi. Sebebi [Olaylar](/rehber/events) ekranındadır.
- **… ilan bloke**: Bu ilanlar için kârlı bir fiyat mümkün değil. **Bloke ilanlar** düğmesi İlanlar ekranını bu filtreyle açar.

Satış modülü kapalıysa rakip, bütçe, gönderim ve bloke satırları gösterilmez.

## Güvenlik Anahtarları

- **Genel durdurma açık / kapalı**: Üst çubuktaki düğmenin durumunu gösterir. Burada değiştirilemez; **Üst çubuktaki düğmeden değiştirilir**.
- **Fiyat gönderimi** (yalnızca satış modülünde): Hesaplanan fiyatların pazaryerlerine gidip gitmediğini belirler. **Fiyat gönderimi kapalı** iken fiyatlar hesaplanır ama hiçbir pazaryerine gönderilmez; yeni kurulumda varsayılan budur. **Fiyat gönderimi açık — gerçek fiyat gönderiliyor** iken uygun ilanların fiyatları pazaryerlerine gider.
  - **Fiyat gönderimini aç** düğmesi onay ister.
  - **Fiyat gönderimini durdur** düğmesi onay istemeden hemen kapatır.
  - Bu anahtar Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Pazaryerleri

Satış modülünde her etkin pazaryeri için bir kart görünür. **Pazaryeri ayarları →** bağlantısı [Pazaryerleri](/rehber/settings-marketplaces) ayarını açar.

Her kartta:

- Pazaryeri adı ve **Gönderim açık** / **Gönderim durduruldu** etiketi. Yanındaki **Durdur** düğmesi yalnızca bu pazaryerine fiyat gönderimini hemen durdurur. **Aç** düğmesi onay ister. Bu düğmeler Yönetici ve Fiyat Yöneticisi rollerine açıktır.
- **Bugünkü güncelleme bütçesi**: O gün pazaryerine gönderilebilecek fiyat değişikliği sayısı. Sağda **… güncelleme kaldı** veya **doldu** yazar; altında **… / … kullanıldı** görünür. Çubuk yeşilse rahat, sarıysa yedek paya inilmiş, kırmızıysa bütçe bitmiştir.
- **Otomasyon**: **açık** ya da **kapalı — fiyat hesaplanmıyor**. Otomasyonu pazaryeri ayarlarından açarsınız.
- **Son içe aktarım**: İlanların pazaryerinden en son ne zaman çekildiği.
- **Son buybox gözlemi**: Buybox bilgisinin en son ne zaman okunduğu.
- **Son rakip taraması**: Rakip verisinin en son ne zaman başarıyla toplandığı. Gecikmişse kırmızı ve **bayat** yazar; son 7 günde hiç yoksa **son 7 günde yok** yazar.

## İlanlar Ne Durumda

İlanlarınızın fiyatlandırma aşamalarına göre dağılımıdır. Beş kutu vardır: **Arıyor**, **Tırmanıyor**, **İnceltiyor**, **Optimum** ve **Bloke**. Bir kutunun üzerine gelince o aşamanın açıklaması görünür. Kutuya tıklayınca [İlanlar](/rehber/listings) ekranı o aşamaya filtrelenmiş olarak açılır. **Bloke** sayısı sıfırdan büyükse kutu sarı görünür.

Altta, ilanlarınızın yüzde kaçının en kârlı fiyatında olduğu yazar. Sağlıklı bir sistemde bu oran yüksektir. Aşamaların anlamı için [Yeniden fiyatlandırma](/rehber/concepts-repricing) sayfasına bakın.

## Son Fiyat Değişiklikleri

Son kararların tablosudur. Sağ üstte kaç karar gösterildiği yazar.

- **Ürün**: Ürün adı ve pazaryeri. Ada tıklayınca ilanın detay sayfası açılır.
- **Fiyat**: Eski fiyat, yön işareti (▲ artış, ▼ düşüş) ve yeni fiyat.
- **Neden**: Kararın sebebi, örneğin **Buybox için fiyat düşürüldü** veya **Zararına satılıyordu — taban fiyata çekildi**.
- **Sonuç**: **Kuyrukta**, **Gönderildi**, **Onaylandı**, **Başarısız**, **Reddedildi** veya **İptal edildi**.
- **Ne zaman**: Kararın ne kadar önce verildiği.

## Marka Denetimi

Marka modülü açıksa ve izlenen marka varsa görünür. **Marka bazında ayrıntı ve son 30 günün seyri** başlığına tıklayınca açılır.

- Tablo sütunları: **Marka**, **Ürün**, **Satıcısız**, **Açık bulgu**, **Son tarama**. Marka adına tıklayınca o markanın [denetim bulguları](/rehber/findings) açılır.
- Grafik: Son 30 gündeki ortalama piyasa fiyatı. Altında her gün için **Satıcı sayısı**, **Satıcısı olan ürün** ve **Satıcısı olmayan ürün** değerleri yer alır. Grafikteki boş günler, o gün yeni bir değişiklik kaydedilmediği anlamına gelir.

## Sistem Günlüğü

Son uyarı ve hata kayıtlarının listesidir. Başlığa tıklayınca açılır. Bu teknik bir kayıttır; müdahale gerektiren bir şey varsa zaten **Dikkat Gerekenler** listesinde görünür. Her satırda **Hata** veya **Uyarı** etiketi, mesaj ve zaman bulunur. Kayıt bir ilanla ilgiliyse **İlana git** bağlantısı çıkar. **Tüm olay günlüğünü aç →** ile [Olaylar](/rehber/events) ekranına gidersiniz.

## Sık sorulanlar

**Panel "Sistem duraklatıldı" diyor. Bir sorun mu var?**
Hayır. Genel durdurma açık demektir; bu güvenli durumdur. Sistemi devam ettirmek için üst çubuktaki **Genel Durdurma: Duraklatıldı** düğmesine tıklayıp onaylayın.

**Sistem çalışıyor ama fiyatlar pazaryerine gitmiyor. Neden?**
Büyük olasılıkla fiyat gönderimi kapalıdır. **Güvenlik Anahtarları** bölümündeki **Fiyat gönderimini aç** düğmesine bakın. Pazaryeri kartındaki **Gönderim durduruldu** etiketini ve **Otomasyon** satırını da kontrol edin.

**Genel durdurma ile fiyat gönderimi arasındaki fark nedir?**
Genel durdurma tüm işleri durdurur. Fiyat gönderimi anahtarı yalnızca gönderimi durdurur; içe aktarma, buybox gözlemi ve karar hesaplama devam eder.

**Neden durdurma düğmelerine tıklayamıyorum?**
Bu düğmeler Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolündeyseniz yöneticinizden yardım isteyin. Roller için [Roller](/rehber/concepts-roles) sayfasına bakın.

**Alarm görünmüyor, her şey yolunda mı?**
Her zaman değil. **Rakip verisi bayat** uyarısı varsa veya **Son rakip taraması** satırı kırmızıysa sistem rakiplere yeterince yakın zamanda bakamamıştır.

<!-- kaynak: doc 06 §2, doc 17 §1.1, §1.3, §5.4, doc 18 §6.2; apps/web/src/app/dashboard-client.tsx, apps/web/src/app/nav-shell.tsx, apps/web/src/app/theme-toggle.tsx, apps/web/src/lib/labels.ts, apps/web/src/lib/scan-freshness.ts, apps/web/src/lib/nav-modules.ts, apps/web/src/lib/permissions.ts -->
