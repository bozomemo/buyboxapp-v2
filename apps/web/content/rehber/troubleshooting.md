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

1. **Sistem duraklatılmış.** Sağ üstteki düğmede **Genel Durdurma: Duraklatıldı** yazıyorsa tüm işler durmuştur. Kurulum Sihirbazı bitmemiş bir kurulum da bu durumda bekler. Düğmeye tıklayıp sistemi başlatın. Bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop).
2. **Panel'de "Worker çalışmıyor".** İşleri çalıştıran arka plan hizmeti durmuş. Kurulumu yapan kişiye başvurun; sunucudaki hizmetin yeniden başlatılması gerekir.
3. **Panel'de "Veritabanına ulaşılamıyor".** Veritabanı bağlantısı kopmuş. **Veritabanı ayarları** bağlantısını açın; bilgiler değişmediyse kurulumu yapan kişiye başvurun.
4. **Panel'de "Veritabanı şeması bu sürümle uyuşmuyor".** Bir güncellemeden sonra veritabanının da güncellenmesi gerekiyor. Yönetici, uyarıdaki **Göçleri uygula** bağlantısıyla bunu yapabilir.
5. **Lisans süresi doldu.** Bkz. [Lisans uyarısı](#lisans-uyarisi).

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

## Hâlâ çözülmediyse

Kurulumu yapan kişiye başvururken şunları hazırlayın:

1. Sorunun ne zaman başladığı ve ne yaptığınızda görüldüğü.
2. **Panel → Dikkat Gerekenler**'deki uyarıların tam metni.
3. **İşler** ekranında başarısız işin adı ve **Detaylar**'daki hata mesajı.
4. **Olaylar** ekranında o zamana ait kırmızı kayıtlar.

<!-- kaynak: doc 06 §2, §7; doc 03 §5, §8; doc 13; doc 17 §5, §6; apps/web/src/app/dashboard-client.tsx attention items, jobs/jobs-client.tsx Devre Kesici, lib/labels.ts, license/*, nav-shell.tsx UpdateNotice; packages/jobs/src/scheduler.ts isSystemPaused -->
