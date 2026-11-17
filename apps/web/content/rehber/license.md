---
id: license
title: Lisans
section: screens
order: 56
module: null
routes:
  - /license
---

**Lisans** ekranı, kurulumunuzun lisans durumunu gösterir ve yeni bir lisans anahtarı girmenizi sağlar. Uygulama lisanslı bir kurulum gerektirir: lisans olmadan hiçbir iş çalışmaz ve hiçbir fiyat gönderilmez. Lisansınızın kaç gün kaldığını görmek ya da yenilenmiş anahtarı girmek için bu ekranı açın. Ekrana **Ayarlar** içindeki **Lisans** sekmesinden ulaşırsınız.

## Lisans durumu

Sayfanın üstünde durum ve kısa bir açıklama yazar:

- **Lisans etkin**: müşteri adı ve kaç gün kaldığı gösterilir. Normal durum budur.
- **Lisans süresi doldu — ek süre kullanılıyor**: lisansın süresi dolmuş ama uygulama kısa bir ek süre boyunca normal çalışmaya devam ediyor. Kaç gün sonra duracağı yazar. Bu süre içinde lisansınızı yenileyin. Ek süre boyunca tüm ekranlarda bir uyarı da görünür.
- **Lisans süresi doldu**: ek süre de doldu ve sistem durduruldu. İçe aktarma, gözlem, fiyat kararı ve fiyat gönderimi yapılmaz. Bu durumda uygulamanın diğer ekranları açılmaz, sizi bu ekrana getirir. Yenilenmiş anahtarı girin.
- **Lisans geçersiz**: anahtar okunamadı ya da doğrulanamadı. Açıklamada nedeni yazar; örneğin anahtar eksik kopyalanmış olabilir ya da sunucu saati geriye alınmış görünüyor olabilir.
- **Lisans bulunamadı**: kurulum henüz lisanslanmamış.

## Lisans anahtarı gir

1. Tedarikçinizden aldığınız anahtarın tamamını kopyalayın.
2. **Lisans anahtarı** alanına yapıştırın. Başında veya sonunda boşluk ya da eksik karakter olmamasına dikkat edin.
3. **Lisansı etkinleştir**'e tıklayın.

Geçerli bir anahtar girildiğinde uygulama yeniden başlatmaya gerek kalmadan kısa süre içinde çalışmaya devam eder.

Ekranı tüm roller görebilir; anahtar girmek yalnızca Yönetici rolüne açıktır.

Ekranda lisansın sunucu ayarından geldiğini belirten bir not görünüyorsa, buraya kaydettiğiniz yeni anahtar o ayarın yerini alır.

## Sık sorulanlar

**Lisansın süresi doldu. Fiyatlarım ne olur?**
Ek süre bitince uygulama hiçbir fiyat göndermez ve hiçbir işi çalıştırmaz. Pazaryerindeki fiyatlarınız son gönderilen değerde kalır. Yeni anahtarı girdiğinizde kaldığı yerden devam eder.

**"Sunucu saati geriye alınmış görünüyor" yazıyor.**
Sunucunun tarih ve saatinin doğru olması gerekir. Kurulumu yapan kişiye başvurun; saat düzeltildikten sonra sayfayı yenileyin.

**Yeni anahtarı nereden alırım?**
Uygulamayı satın aldığınız tedarikçiden.

<!-- kaynak: doc 13 §4, §4.1, §4.2, §4.3, §6; apps/web/src/app/license/page.tsx, license/license-client.tsx, app/api/license/route.ts, app/nav-shell.tsx (ek süre uyarısı) -->
