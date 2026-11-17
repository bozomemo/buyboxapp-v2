---
id: events
title: Olaylar
section: screens
order: 41
module: null
routes:
  - /events
---

**Olaylar** ekranı, arka plan işlerinin ve pazaryeri bağlantılarının tuttuğu teknik günlüktür. Bir işin genel durumunu görmek için [İşler](/rehber/jobs) ekranı yeterlidir. Buraya bir olayın tam olarak **ne zaman** ve **neden** yaşandığını aramak için gelin: örneğin bir fiyat gönderiminin neden reddedildiğini ya da bir ilanla ilgili hangi uyarıların yazıldığını görmek için.

## Filtrele

Listeyi daraltmak için üstteki alanları kullanın. Her değişiklikte liste yeniden yüklenir.

- **En düşük seviye**: **Tümü**, **debug ve üzeri**, **bilgi ve üzeri**, **uyarı ve üzeri** veya **yalnızca hata**. Sorun ararken önce **uyarı ve üzeri** ile başlayın.
- **Pazaryeri**: **Tümü**, **Trendyol** veya **Hepsiburada**.
- **Kod**: olayın kodu. Kodu tam olarak, büyük-küçük harfiyle yazın; bir kısmını yazmak sonuç vermez. Kodu listedeki **Kod** sütunundan kopyalayabilirsiniz.
- **İlan**: ürün adını yazmaya başlayın, çıkan listeden ilanı seçin. Yalnızca o ilana ait olaylar görünür.
- **Başlangıç** ve **Bitiş**: tarih aralığı.

## Olaylar listesi

Başlıkta kaç kayıt bulunduğu yazar, ör. **Olaylar (250)**. Sütunlar:

| Sütun | Ne gösterir |
|---|---|
| **Zaman** | Olayın tam tarihi ve saati. |
| **Seviye** | **hata**, **uyarı**, **bilgi** veya **debug**. Hatalar kırmızı, uyarılar sarı görünür. |
| **Pazaryeri** | Olayın ilgili olduğu pazaryeri; yoksa "—". |
| **Kod** | Olayın kısa, sabit adı. Aynı türden olayları aramak için **Kod** filtresine yazabilirsiniz. |
| **Mesaj** | Ne olduğunun açıklaması. |
| **Bağlantılar** | Olay bir ilanla ilgiliyse **İlan** bağlantısı; tıklayınca ilanın ayrıntı sayfası açılır. |

**Sütunlar** menüsüyle sütunları gizleyip sıralayabilir, **Excel'e Aktar** ile görünen listeyi dosya olarak indirebilirsiniz. Liste sayfalara bölünür; çok eski kayıtları görmek için tarih aralığını daraltın.

Olaylar belli bir süre saklanır, sonra silinir. Süreleri [Veri Saklama](/rehber/settings-retention) ekranında görebilirsiniz.

Ekranı tüm roller görebilir; bu ekranda değişiklik yapan bir işlem yoktur.

## Sık sorulanlar

**"Bu filtreye uyan olay yok" diyor.**
Filtreleri gevşetin ya da tarih aralığını genişletin. Seviye filtresi **yalnızca hata** ise uyarılar görünmez.

**Bir ilanın fiyatı neden değişmedi, buradan anlayabilir miyim?**
**İlan** alanından ilanı seçin ve **uyarı ve üzeri** ile süzün. Gönderim hataları ve reddedilen fiyatlar burada yazar. Kararın kendisi için ilanın ayrıntı sayfasına bakın: [İlanlar](/rehber/listings).

**Olayları birine göndermem gerekiyor.**
Filtreleyin, sonra **Excel'e Aktar**'a tıklayın. İnen dosyayı kurulumu yapan kişiye iletebilirsiniz.

<!-- kaynak: doc 06 §8, doc 15 §3.2; apps/web/src/app/events/page.tsx, events/events-client.tsx, lib/labels.ts (LEVEL_LABELS), components/table.tsx, app/api/events/route.ts -->
