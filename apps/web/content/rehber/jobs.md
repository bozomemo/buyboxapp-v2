---
id: jobs
title: İşler
section: screens
order: 40
module: null
routes:
  - /jobs
---

**İşler** ekranı, uygulamanın arka planda kendi kendine yaptığı işleri gösterir: ilanların içe aktarılması, buybox gözlemi, yeniden fiyatlandırma, fiyat gönderimi, rakip verisi toplama ve diğerleri. "Bir şey neden çalışmıyor?", "Bu iş takıldı mı?", "En son ne zaman başarısız oldu?" sorularının cevabı buradadır. Ekran kendini birkaç saniyede bir yeniler; sayfayı yenilemeniz gerekmez.

## Üstteki uyarı şeridi

Her şey normal çalışırken bu şerit görünmez. Görünüyorsa hiçbir iş ilerlemiyor demektir ve şerit nedenini söyler:

- **Güncelleme nedeniyle fiyat işleri duraklatıldı.** Bir güncelleme kuruluyordur; bitince kendiliğinden kalkar. Güncelleme sürmüyorsa [Güncelleme](/rehber/settings-update) ekranına bakın.
- **Genel durdurma açık — hiçbir iş çalışmıyor.** Biri genel durdurmayı açmıştır. [Panel](/rehber/panel) ekranından devam ettirin. Bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop).
- **Worker çalışmıyor** ya da **Worker … saniyedir tick atmadı.** İşleri çalıştıran arka plan servisi durmuş ya da yanıt vermiyor. Kurulumu yapan kişiye başvurun.
- **Lisans geçersiz veya süresi dolmuş.** Lisans olmadan hiçbir iş çalışmaz. Bkz. [Lisans](/rehber/license).
- **Scheduler kilidi başka bir instance'da.** Aynı veritabanına bağlı ikinci bir kurulum işleri üstlenmiş. Kurulumu yapan kişiye başvurun.

Son yenileme başarısız olursa **Son yenileme başarısız oldu** uyarısı çıkar; altındaki bilgiler eski olabilir.

## Tarama Turları

Rakip verisi toplayan işlerin ne kadar ilerlediğini pazaryeri başına iki çubukla gösterir:

- **Tarama turu**: tüm takip edilen ürünlerin taranması.
- **İlanlar turu**: yalnızca kendi ilanlarınızın taranması.

Her çubukta tur numarası, kaç üründen kaçının okunduğu, okunamayan ürün sayısı (**okunamadı**), **Başlangıç** saati ve **Tahmini bitiş** ya da **Tamamlandı** saati yazar. **Önceki tur** bir önceki turun kaç ürün ve ne kadar sürdüğünü gösterir. Bu veriler yalnızca raporlama içindir; fiyat kararlarını etkilemez. Bkz. [Rakip Verisi](/rehber/concepts-competitor-data).

## İş Kataloğu

Her satır bir iştir. Kapalı bir modüle ait işler varsayılan olarak gizlenir; tablonun altındaki **Kapalı modüllerin … işi gizli — göster** düğmesiyle görebilirsiniz.

| Sütun | Ne gösterir |
|---|---|
| **İş** | İşin adı. Adında **(raporlama)** geçen işler yalnızca rapor verisi toplar, fiyata dokunmaz. |
| **Durum** | **Çalışıyor** (yanında ilerleme, ör. 40/200), **Kuyrukta** (sırasını bekliyor) veya **Boşta**. |
| **Sıklık** | İşin kaç saniyede bir çalıştığı. Kutuya yeni değeri saniye olarak yazıp **Kaydet**'e tıklayın. **Varsayılana dön** değeri ilk haline getirir. **Yalnızca manuel** yazan işler kendiliğinden çalışmaz. |
| **Son Çalışma** | Ne kadar önce çalıştığı ve sonucu: **Başarılı**, **Başarısız** veya **Çalışıyor**. Hiç çalışmadıysa **Hiç çalışmadı**. |
| **Sonraki Çalışma** | Bir sonraki zamanlanmış çalışma (ör. "5 dk sonra" veya **şimdi**). |
| **Etkin** | **Etkin** / **Devre dışı** düğmesi. Tıklayınca iş açılır veya kapanır. Kapalı bir iş zamanında çalışmaz. **Modül kapalı** etiketi, işin kapalı bir modüle ait olduğunu gösterir; tıklarsanız [Modüller](/rehber/settings-modules) ekranı açılır. |
| **Şimdi Çalıştır** | **Çalıştır** işi hemen sıraya koyar. Pazaryeri başına çalışan işlerde önce yanındaki listeden pazaryerini seçin. İş sıradayken düğme **Kuyruğa alındı**, çalışırken **Çalışıyor…** yazar ve ikinci kez basılamaz. **Detaylar** satırın altında ayrıntıları açar. |

### Sıklık değişikliği ne zaman geçerli olur?

Yeni sıklık kaydedildiği an değil, arka plan servisi yeniden başlatıldığında geçerli olur. Kaydedip henüz geçerli olmayan bir değerin yanında **⚠ Kaydedildi, henüz geçerli değil** uyarısı görünür. Uygulamak için:

1. Tablonun üstündeki **Worker'ı Yeniden Başlat** düğmesine tıklayın. Bekleyen değişiklik varsa düğmede sayısı yazar, ör. **(2 bekleyen)**.
2. O sırada çalışan işler varsa yeniden başlatma bitmelerini bekler; iş kaybolmaz.

### Detaylar paneli

**Detaylar**'a tıklayınca işin son çalışması açılır:

- Durum (**Çalışıyor**, **Başarısız**, **Tamamlandı**), başlangıç zamanı ve geçen süre.
- İlerleme çubuğu ve "… / … öğe". Çalışma bitince **başarılı** ve **başarısız** sayıları da görünür.
- **Şu an:** o anda işlenen öğe.
- Uzun süre ilerleme bildirilmezse **iş takılmış ya da worker durmuş olabilir** uyarısı çıkar.
- **Olaylar**: bu çalışmanın yazdığı kayıtlar, saatiyle birlikte.

## Devre Kesici (Circuit Breaker)

Bir pazaryerine giden istekler art arda hata verirse uygulama o pazaryerine bir süre istek göndermeyi durdurur. Durumlar:

- **Kapalı (normal)**: istekler normal gidiyor.
- **Açık (devre dışı)**: o pazaryerine istekler duraklatıldı. Yanında ardışık hata sayısı ve son hata yazar.
- **Yarı açık (deneme)**: uygulama bağlantının düzelip düzelmediğini deniyor.

Hiç sorun olmadıysa **Hiç tetiklenmedi.** yazar. Sorunu giderdiyseniz (ör. pazaryeri bilgilerini düzelttiyseniz) **Sıfırla** ile devreyi hemen kapatabilirsiniz. Devre açıkken yalnızca o pazaryerine giden çağrılar ertelenir; diğer işler çalışmaya devam eder.

## Kuyruk Derinliği ve Alınan İşler

Sıradaki işlerin sayısını dört kutuda gösterir: **ready** (sırada bekleyen), **locked** (şu an çalışan), **done** (tamamlanan), **failed** (başarısız). Altında şu an çalışan işlerin listesi, kaçıncı denemede oldukları ve kilidin ne zaman biteceği yazar. Bu bölüm genellikle sorun ararken kullanılır.

## Tarama Hızı (Rakip Verisi Toplama) — gelişmiş ayar

Varsayılan olarak kapalıdır; başlığa tıklayınca açılır. Rakip verisinin pazaryerinden ne hızla okunacağını belirler. Yalnızca raporlamayı etkiler, fiyat kararlarını etkilemez.

| Sütun | Anlamı |
|---|---|
| **Pazaryeri** | Ayarın ait olduğu pazaryeri. |
| **İstek/Dakika** | Dakikada en fazla kaç sayfa okunacağı. Erişim hataları sıklaşırsa bu değeri düşürün. Trendyol'da bu bir üst sınırdır; pazaryeri yavaşlamamızı isterse hız kendiliğinden yarıya iner, sorun kalmayınca yeniden artar ve her değişiklik [Olaylar](/rehber/events) ekranına yazılır. |
| **Patlama (burst)** | Kısa bir anda arka arkaya yapılabilecek istek sayısı. |
| **Zaman Aşımı (sn)** | Tek bir sayfanın açılması için beklenen süre. Olaylarda "Timeout … exceeded" hataları görüyorsanız bu değeri yükseltin. |
| **Varsayılan** | Varsayılan değerler; değiştirdiyseniz yanında **(özelleştirildi)** yazar. |
| **Kaydet** | Satırdaki değerleri kaydeder. |

Değişiklik, arka plan servisi bir sonraki başlatıldığında geçerli olur.

## Çalışma Geçmişi

Geçmiş çalışmaların listesi. Üstteki listelerden işe (**Tüm işler**) ve duruma (**Tüm durumlar**, **Başarılı**, **Başarısız**) göre süzebilirsiniz. Sütunlar: **İş**, **Başlangıç**, **Süre**, **Durum**, **Öğeler** (ör. "180/200 başarılı, 20 başarısız") ve **Hata**.

**Sütunlar** menüsüyle sütunları gizleyip sıralayabilir, **Excel'e Aktar** ile listeyi dosya olarak indirebilirsiniz.

## Kimler ne yapabilir?

- Ekranı tüm roller görebilir.
- **Çalıştır**, **Etkin** / **Devre dışı** ve devre kesici **Sıfırla** işlemleri Yönetici ve Fiyat Yöneticisi rollerine açıktır.
- **Sıklık** değiştirme, **Varsayılana dön**, **Worker'ı Yeniden Başlat** ve **Tarama Hızı** ayarları yalnızca Yönetici rolüne açıktır.

Bkz. [Roller ve Yetkiler](/rehber/concepts-roles).

## Sık sorulanlar

**Bir işi hemen çalıştırmak istiyorum ama Çalıştır düğmesi soluk.**
İş zaten sırada ya da çalışıyor olabilir; bitmesini bekleyin. İş kapalı bir modüle aitse (**Modül kapalı**) çalıştırılamaz. Rolünüz İzleyici ise bu düğme size kapalıdır.

**Sıklığı değiştirdim ama iş eski sıklıkla çalışıyor.**
Değişiklik, **Worker'ı Yeniden Başlat**'a tıklayana kadar geçerli olmaz. Satırdaki **⚠ Kaydedildi, henüz geçerli değil** uyarısı bunu gösterir.

**Hiçbir iş çalışmıyor, Durum hep Kuyrukta.**
Ekranın üstündeki uyarı şeridine bakın. Genel durdurma, lisans veya arka plan servisi nedeni orada yazar. Bkz. [Sorun Giderme](/rehber/troubleshooting).

**Devre Kesici "Açık (devre dışı)" gösteriyor. Fiyatlar güncellenmiyor mu?**
O pazaryerine giden istekler bir süre ertelenir. Yanındaki son hatayı okuyun; çoğu zaman pazaryeri bilgileri veya pazaryerinin geçici bir sorunudur. Sorun giderildiyse **Sıfırla**'ya tıklayın.

<!-- kaynak: doc 06 §7, doc 07 §3, §7.4, §7.5, §8.1, doc 15 §6 2.1, doc 18 §6.2; apps/web/src/app/jobs/page.tsx, jobs/jobs-client.tsx, components/sweep-pass-card.tsx, components/table.tsx, lib/labels.ts (JOB_LABELS, JOB_RUN_STATE_LABELS, CIRCUIT_LABELS), app/api/jobs/*/route.ts -->
