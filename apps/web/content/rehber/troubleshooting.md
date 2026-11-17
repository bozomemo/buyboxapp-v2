---
id: troubleshooting
title: Sorun Giderme
section: troubleshooting
order: 1
module: null
routes: []
---

Her başlık bir belirtiyle başlar. Altında olası nedenler, en sık rastlanandan başlayarak, ve her biri için neye bakacağınız yazar. Hiçbiri çözmezse en sondaki adımı izleyin.

İlk adım her zaman aynıdır: **Panel**'i açın ve **Dikkat Gerekenler** bölümüne bakın. Uygulama bildiği sorunları orada adıyla gösterir.

## Hiçbir şey çalışmıyor, veriler güncellenmiyor

1. **Sistem duraklatılmış.** Sağ üstteki düğmede **Genel Durdurma: Duraklatıldı** yazıyorsa tüm işler durmuştur. Yeni kurulumlar da bu durumda başlar. Düğmeye tıklayıp sistemi başlatın. Bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop).
2. **Panel'de "Worker çalışmıyor".** İşleri çalıştıran arka plan hizmeti durmuş. Kurulumu yapan kişiye başvurun; sunucudaki hizmetin yeniden başlatılması gerekir.
3. **Panel'de "Veritabanına ulaşılamıyor".** Veritabanı bağlantısı kopmuş. **Veritabanı ayarları** bağlantısını açın; bilgiler değişmediyse kurulumu yapan kişiye başvurun.
4. **Panel'de "Veritabanı şeması bu sürümle uyuşmuyor".** Bir güncellemeden sonra veritabanının da güncellenmesi gerekiyor. Yönetici, uyarıdaki **Göçleri uygula** bağlantısıyla bunu yapabilir.
5. **Lisans süresi doldu.** Bkz. [Lisans uyarısı](#lisans-uyarisi).

## Fiyatlar pazaryerine gitmiyor (satış modülü)

1. **Fiyat gönderimi kapalı.** **Panel → Güvenlik Anahtarları**'nda **Fiyat gönderimi: kapalı** yazıyorsa uygulama fiyatları hesaplar ama göndermez. Yeni kurulumda kapalı başlar.
2. **Pazaryeri için gönderim durdurulmuş.** **Panel → Pazaryerleri**'nde o pazaryerinin yanında **Gönderim durduruldu** yazıyorsa **Aç**'a tıklayın.
3. **Devre kesici açık.** Bir pazaryeri art arda hata verirse uygulama o pazaryerine gönderimi kendiliğinden keser. **İşler** ekranındaki **Devre Kesici (Circuit Breaker)** bölümünde **Açık (devre dışı)** ve son hata yazar. Hatanın nedenini giderin (çoğu zaman pazaryeri bağlantı bilgileri), sonra **Sıfırla**'ya tıklayın.
4. **Günlük güncelleme bütçesi doldu.** Karar açıklamasında _Günlük güncelleme bütçesi doldu_ yazar. Ertesi gün kendiliğinden devam eder.
5. **İlanın otomasyonu kapalı.** Bkz. [Fiyatım değişmiyor](#fiyatim-degismiyor).

## Fiyatım değişmiyor

**İlanlar** ekranında ilanı açın ve son karar açıklamasına bakın. Neden orada yazar:

| Açıklama | Ne yapmalı |
|---|---|
| _En iyi fiyatta tutuluyor_ | Sorun yok. Buybox sizde ve en kârlı fiyattasınız. |
| _Piyasa taban fiyatımızın altında — beklemede_ | Rakip, zarar etmeden inebileceğiniz fiyatın altında. Maliyetinizi ve ücretlerinizi kontrol edin; doğruysa beklenen davranıştır. |
| _Bu ilan için fiyatlama kapalı_ | İlanın otomasyonu kapalı, ilan satışta değil ya da stok kuralına takılıyor. |
| _Maliyet hesaplanamadı_ | **Stok** ekranında bu ürünün maliyetini girin. |
| _Yeterli buybox verisi yok_ | Buybox bilgisi henüz gelmedi ya da eski. Sistem duraklatılmış veya bir iş başarısız olabilir; **İşler** ekranına bakın. |
| _Önceki gönderimin onayı bekleniyor_ / _Piyasanın oturması bekleniyor_ | Son değişikliğin sonucu bekleniyor. Birkaç dakika içinde kendiliğinden ilerler. |
| _Ayarlanan üst sınır taban fiyatın altında_ | İlanın **Min/Max** değerindeki üst sınır, taban fiyatın altında. Düzeltin. |
| _Pazaryerinin izin verdiği aralık dışında_ | Pazaryeri bu fiyatı kabul etmedi. Pazaryerindeki fiyat sınırlarını kontrol edin. |

Bkz. [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing).

## Fiyat beklenmedik şekilde yüksek veya düşük

1. **Maliyet yanlış.** En sık neden budur. **Stok** ekranında ürünün **Birim Fiyat (₺, KDV dahil)** değerini kontrol edin. KDV hariç girilmiş bir maliyet taban fiyatı düşük gösterir.
2. **Ücret ayarları yanlış.** **Ayarlar → Ücretler**'de kargo ve gider bantlarını kontrol edin.
3. **Adet veya paket hatası.** Çoklu satılan bir ilanda adet sayısı ya da paket bileşenleri yanlış olabilir.
4. **Tek satıcısınız.** Rakip yoksa fiyat hedef kâr oranına göre belirlenir; **Ayarlar → Politika**'yı kontrol edin.

Acil durumda sağ üstteki düğmeyle sistemi durdurun; pazaryerindeki fiyatlar olduğu gibi kalır, yalnızca yeni değişiklik yapılmaz.

## Rakip verisi boş veya eski

1. **Panel'de "Rakip verisi bayat".** Son başarılı toplama uzun zaman önce. Sistem duraklatılmış olabilir; **İşler** ekranında ilgili işin son çalışmasına ve hatasına bakın.
2. Son tur başarısız olmuş olabilir; uygulama sonraki turda yeniden dener.
3. Rakip verisi fiyat kararlarını **etkilemez**; boş olması fiyatlamayı durdurmaz. Bkz. [Rakip Verisi](/rehber/concepts-competitor-data).

## Bir iş sürekli başarısız oluyor

1. **İşler** ekranında işin son çalışmasının **Detaylar**'ını açın; hata mesajı orada yazar.
2. Hata pazaryeri kimlik bilgileriyle ilgiliyse (yetkisiz, geçersiz anahtar) **Ayarlar → Pazaryerleri**'nden bilgileri yeniden girin. Bkz. [Pazaryerleri](/rehber/settings-marketplaces).
3. Düzelttikten sonra **Şimdi Çalıştır** ile işi hemen deneyebilirsiniz.
4. İş **Modül kapalı** görünüyorsa o modül bu kurulumda kapalıdır; bu bir hata değildir.

## Pazaryeri bağlantı bilgileri kabul edilmiyor

1. Bilgileri pazaryerinin satıcı panelinden yeniden kopyalayın; başta veya sonda boşluk kalmadığından emin olun.
2. Pazaryeri anahtarları yenilediyse eski anahtar artık çalışmaz; yenisini girin.
3. Uygulama girilen bilgileri güvenlik için hiçbir zaman geri göstermez. Emin değilseniz her alanı yeniden girin.

## Lisans uyarısı

| Ekranda | Anlamı | Ne yapmalı |
|---|---|---|
| **Lisans süresi doldu — ek süre kullanılıyor** | Lisansın süresi bitti; 7 günlük ek süre içindesiniz ve uygulama normal çalışıyor. Üstte kalan süreyi gösteren bir şerit görünür. | Tedarikçinizden yeni anahtar isteyin ve **Lisans** ekranına girin. |
| **Lisans süresi doldu** | Ek süre de bitti; tüm işler durur ve ekranlar lisans ekranına yönlendirir. Giriş yapmak her zaman mümkündür. | Yönetici yeni anahtarı **Lisans** ekranına girer. |
| **Lisans geçersiz** / **Lisans bulunamadı** | Anahtar eksik kopyalanmış ya da bu kurulum için değil. | Anahtarın tamamını boşluksuz yapıştırın; olmazsa tedarikçinizden yeni anahtar isteyin. |

Bkz. [Lisans](/rehber/license).

## Güncelleme sonrası sorunlar

- Üst çubukta **Güncelleme geri alınamadı — fiyat işleri durduruldu** yazıyorsa bir güncelleme yarıda kaldı ve uygulama güvenlik için fiyat işlerini durdurdu. Kurulumu yapan kişiye hemen başvurun.
- Panel'de **Veritabanı şeması bu sürümle uyuşmuyor** görünüyorsa yukarıdaki [Hiçbir şey çalışmıyor](#hicbir-sey-calismiyor-veriler-guncellenmiyor) bölümüne bakın.

Bkz. [Güncelleme](/rehber/settings-update).

## Giriş yapılamıyor

- Parola unutuldu, hesap kilitlendi ya da doğrulama kodu yok: Bkz. [Giriş ve İlk Yönetici](/rehber/sign-in).
- Giriş ekranı yerine **İlk yönetici** ekranı geliyor: Kurulumda henüz yönetici yok ya da veritabanı değişti. Kurulumu yapan kişiye başvurun.

## Marka alarmları gelmiyor (marka modülü)

1. Sistem duraklatılmış olabilir; üst çubuktaki düğmeye bakın.
2. **Alarmlar** ekranının üstünde verilerin eski olduğuna dair bir uyarı varsa son tarama uzun zaman önce yapılmıştır; **İşler** ekranına bakın.
3. Ürünün fiyat bandı (en düşük / en yüksek) girilmemiş ya da ürün bir karta bağlanmamış olabilir. Bkz. [Marka Stok](/rehber/brand-products).
4. Bildirim gelmiyorsa **Ayarlar → Bildirimler**'de kanalın hazır olduğunu ve alıcıların girildiğini kontrol edin; **Test gönder** ile deneyin. Bkz. [Bildirimler](/rehber/settings-notifications).

## Hâlâ çözülmediyse

Kurulumu yapan kişiye başvururken şunları hazırlayın:

1. Sorunun ne zaman başladığı ve ne yaptığınızda görüldüğü.
2. **Panel → Dikkat Gerekenler**'deki uyarıların tam metni.
3. **İşler** ekranında başarısız işin adı ve **Detaylar**'daki hata mesajı.
4. **Olaylar** ekranında o zamana ait kırmızı kayıtlar.

<!-- kaynak: doc 06 §2, §7; doc 03 §5, §8; doc 13; doc 17 §5, §6; apps/web/src/app/dashboard-client.tsx attention items, jobs/jobs-client.tsx Devre Kesici, lib/labels.ts, license/*, nav-shell.tsx UpdateNotice; packages/jobs/src/scheduler.ts isSystemPaused -->
