---
id: settings-notifications
title: Bildirimler
section: screens
order: 48
module: null
routes:
  - /settings/notifications
---

**Bildirimler** sekmesi, fiyat bandı ihlallerinin size hangi kanallardan ve kimlere bildirileceğini gösterir. Bir satıcı ürününüzü belirlediğiniz fiyat bandının dışında satmaya başladığında haberdar olmak için bu ayarı yaparsınız.

Kurallar:

- Yalnızca **yeni açılan** her ihlal bildirilir. Devam eden ve kapanan ihlaller bildirilmez.
- Aynı satıcı 6 saat içinde yeniden bandın dışına çıkarsa kayıt tutulur ama tekrar bildirilmez.

İhlallerin kendisini [Satıcı Politikası](/rehber/seller-policy) ve [Marka Alarmları](/rehber/brand-alerts) bölümlerinde bulabilirsiniz.

## Kanallar

Üç kanal listelenir: **Webhook**, **E-posta** ve **SMS**. Her kanalın yanında durumu yazar:

- **hazır**: kanal kullanılabilir.
- Hazır değilse nedeni yazar (ör. sunucu ayarı eksik).

Kanalların açıklamaları:

- **Webhook**: Slack veya Teams gibi bir sohbet kanalına mesaj gönderir. Adresi sunucuda ayarlanır; bu ekrandan girilmez.
- **E-posta**: e-posta sunucusu sunucuda ayarlanır; alıcıları aşağıda girersiniz.
- **SMS**: tek satırlık bir özet gönderir. SMS sağlayıcısı ayarlandığında etkinleşir; numaraları aşağıda girersiniz.

Webhook adresi, e-posta sunucusu veya SMS sağlayıcısı ayarlanmamışsa kurulumu yapan kişiye başvurun.

Kanalda gönderim yapıldıysa altında sayılar görünür: **gönderildi**, **bekliyor**, **başarısız**, **sessiz dönemde** (6 saat kuralı nedeniyle gönderilmedi).

**Test gönder** o kanaldan bir deneme mesajı gönderir ve sonucu ekranın altında gösterir. Kanal hazır değilse düğme soluk görünür.

## Alıcılar

- **E-posta adresleri (her satıra bir tane)**: bildirim alacak e-posta adresleri.
- **SMS numaraları (her satıra bir tane)**: bildirim alacak cep telefonu numaraları.

Listeyi düzenleyip **Kaydet**'e tıklayın. **Alıcılar kaydedildi.** mesajı görünür.

## Kim değiştirebilir?

**Test gönder** ve **Kaydet** yalnızca Yönetici rolüne açıktır. Diğer roller ayarları görebilir.

## Sık sorulanlar

**Test mesajı geldi ama gerçek ihlallerde bildirim gelmiyor.**
Yalnızca yeni açılan ihlaller bildirilir. Aynı satıcı 6 saat içinde tekrar bandın dışına çıktıysa bildirim gönderilmez; sayılarda **sessiz dönemde** olarak görünür.

**E-posta kanalı "hazır" değil.**
E-posta sunucusu ayarı bu ekrandan yapılmaz. Kurulumu yapan kişiye başvurun.

**Bildirimleri tamamen kapatmak istiyorum.**
Alıcı listelerini boşaltıp **Kaydet**'e tıklayın. Webhook kanalı sunucu ayarıyla çalıştığı için onu kapatmak için kurulumu yapan kişiye başvurun.

<!-- kaynak: doc 17 §6; apps/web/src/app/settings/notifications/page.tsx, settings/notifications/notifications-client.tsx, app/api/settings/notifications/route.ts, app/api/settings/notifications/test/route.ts -->
