---
id: settings-update
title: Güncelleme
section: screens
order: 51
module: null
routes:
  - /settings/update
---

**Güncelleme** sekmesi, uygulamanın yeni bir sürümü olup olmadığını gösterir ve hazır olan sürümü kurmanızı sağlar. Uygulama yeni sürümleri kendisi kontrol eder ve indirir, ama **kurulumu siz başlatırsınız**. Kurulum sırasında servis birkaç dakika durduğu için bunu yoğun satış saatlerinin dışında yapmanızı öneririz.

Bu sekme yalnızca Yönetici rolüne görünür ve açılır. Kurulumda otomatik güncelleme yoksa ekranda yalnızca **Bu kurulumda otomatik güncelleme yok.** yazar; bu durumda güncelleme için kurulumu yapan kişiye başvurun.

## Kurulu Sürüm

- **Çalışan sürüm**: şu anda kullandığınız sürüm.
- **Son kontrol**: yeni sürümün en son ne zaman kontrol edildiği ve sonucu. Olası sonuçlar:
  - **Güncel**: yeni sürüm yok.
  - **Yeni sürüm indirildi, kurulmaya hazır**
  - **Sürümün imzası yok**, **Sürümün imzası doğrulanamadı**, **Sürüm bildirimi geçersiz**: indirilen sürüm güvenlik kontrolünden geçmedi ve kurulmaz.
  - **İndirme başarısız**, **Sunucuya ulaşılamadı**: bağlantı sorunu; **Şimdi kontrol et** ile yeniden deneyebilirsiniz.
  - **Kontrol kapalı**: bu kurulumda otomatik kontrol kapatılmış.
- **Şimdi kontrol et**: beklemeden hemen kontrol eder.

## Kurulmaya Hazır

Yeni bir sürüm indirilmişse bu kart görünür. Sürüm numarasını, indirme boyutunu ve sürüm notlarını gösterir.

Kurmak için:

1. **Şimdi kur**'a tıklayın.
2. Onay penceresini okuyun: servis 2–3 dakika duracak ve fiyat işleri yeni sürüm doğrulanana kadar duraklatılmış kalacaktır. **Şimdi kur** ile onaylayın.
3. Kart **Kuruluyor…** gösterir. Bu sırada ekran birkaç kez bağlantı kuramayabilir; bu normaldir. Sayfayı kapatmayın.
4. Kurulum bitince sonuç **Geçmiş** bölümünde görünür.

Kurulum süresince [İşler](/rehber/jobs) ekranında **Güncelleme nedeniyle fiyat işleri duraklatıldı.** uyarısı görünür. Yeni sürüm sorunsuz açılınca fiyat işleri kendiliğinden devam eder.

## Geçmiş

Önceki kurulum denemelerini listeler: sonuç, hangi sürümden hangisine geçildiği ve ne kadar önce olduğu. Sonuçlar:

- **Başarılı**: yeni sürüm kuruldu ve çalışıyor.
- **Geri dönüldü**: yeni sürüm doğrulanamadı, uygulama otomatik olarak eski sürüme döndü. Altında nedeni yazar.
- **İptal edildi**: kurulum başlamadan durduruldu.
- **Elle müdahale gerekli**: uygulama kendini düzeltemedi. Kurulumu yapan kişiye hemen başvurun.

## Sık sorulanlar

**Kurulum sırasında fiyatlar ne olur?**
Fiyat gönderimi duraklatılır; yanlış fiyat gönderilmez. Yeni sürüm doğrulanınca işler kendiliğinden devam eder.

**Kurulumdan sonra "Geri dönüldü" yazıyor.**
Yeni sürüm sorunsuz açılmadığı için eski sürüm geri yüklendi; uygulama çalışmaya devam eder. Nedeni kurulumu yapan kişiye iletin.

**İşler ekranında güncelleme uyarısı kalktı mı diye nasıl anlarım?**
[İşler](/rehber/jobs) ekranındaki uyarı şeridi kaybolduysa duraklatma kalkmıştır. Uyarı uzun süre kalıyorsa ve burada **Elle müdahale gerekli** görünüyorsa kurulumu yapan kişiye başvurun.

<!-- kaynak: doc 14, auto-update spec §5.2, §5.3; apps/web/src/app/settings/update/page.tsx, settings/update/update-client.tsx, lib/labels.ts (UPDATE_CHECK_LABELS, UPDATE_OUTCOME_LABELS), app/api/update/*/route.ts, app/jobs/jobs-client.tsx (SchedulerBanner) -->
