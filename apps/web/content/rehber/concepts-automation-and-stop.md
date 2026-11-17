---
id: concepts-automation-and-stop
title: Otomasyon ve Durdurma
section: concepts
order: 5
module: null
routes: []
---

Her ekranın sağ üstündeki **Genel Durdurma** düğmesi, uygulamadaki tüm işleri tek tıkla durdurur. Satış modülünde bunun yanında fiyat gönderimini ayrıca durduran anahtarlar da vardır; bkz. [Fiyat Gönderimi ve İlan Otomasyonu](/rehber/concepts-price-submission).

## Genel Durdurma (tüm sistem)

Her ekranın sağ üstündeki düğme. Normalde **Sistem Çalışıyor** yazar.

- Tıkladığınızda **tüm işler** durur: içe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi. Marka modülünün taramaları da durur.
- Düğme **Genel Durdurma: Duraklatıldı** olarak değişir.
- Yeniden başlatmak için aynı düğmeye tıklayın; uygulama onay ister, çünkü tüm işler yeniden başlar.

Ne zaman: Bir şeylerin ters gittiğinden şüphelendiğinizde, nedenini anlayana kadar her şeyi durdurmak için. Tek tıkla, her ekrandan.

> **Yeni kurulum duraklatılmış başlar.** Güvenlik için yeni bir kurulumda hiçbir iş çalışmaz; ayarlarınızı tamamladıktan sonra **Genel Durdurma: Duraklatıldı** düğmesine tıklayıp sistemi siz başlatırsınız.

## Kim ne yapabilir

- **Durdurmak**: **Yönetici** ve **Fiyat Yöneticisi**.
- **Yeniden başlatmak** da aynı iki role açıktır. Durdurmak ve başlatmak ayrı yetkilerdir: durdurmak hiçbir zaman zarar vermez, başlatmak ise tüm işleri yeniden çalıştırır.
- **İzleyici** hiçbirini yapamaz; düğmeler onun için pasif görünür.

## Sık sorulanlar

**Sistemi durdurdum; daha önce yapılan değişiklikler geri alınır mı?**
Hayır. Durdurma yalnızca bundan sonrasını etkiler; pazaryerindeki mevcut fiyatlar ve kayıtlar olduğu gibi kalır.

**Düğme gri, tıklayamıyorum.**
Rolünüz bu işleme izin vermiyor. Bir yöneticiye başvurun.

<!-- kaynak: doc 06 §2; doc 18 §6.1, §6.2; apps/web/src/app/nav-shell.tsx SystemPauseButton, dashboard-client.tsx Güvenlik Anahtarları / Pazaryerleri, listings/listings-client.tsx, listings/[id]/listing-detail-client.tsx -->
