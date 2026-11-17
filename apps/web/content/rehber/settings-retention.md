---
id: settings-retention
title: Veri Saklama
section: screens
order: 49
module: null
routes:
  - /settings/retention
---

**Saklama** sekmesi, geçmiş kayıtların kaç gün tutulacağını belirler. Süresi dolan kayıtlar her gün çalışan **Geçmiş Temizliği** işiyle silinir. Veritabanı büyüdüğünde süreleri kısaltabilir, daha uzun geçmişe bakmanız gerektiğinde uzatabilirsiniz.

Sayfanın üstünde **Şu anda varsayılan pencereler kullanılıyor** veya **Özelleştirilmiş pencereler kullanılıyor.** yazar. Rakip teklif geçmişinin bir kısmı süresiz saklanır ve bu listede yer almaz.

## Saklama Pencereleri

Her alan, o tür kaydın kaç gün saklanacağıdır:

| Alan | Ne saklanır |
|---|---|
| **Fiyat gönderimleri (gün)** | Pazaryerine gönderilen fiyat değişiklikleri. |
| **Buybox gözlemleri (gün)** | İlanlarınızın buybox durumu ve fiyat okumaları. |
| **Rakip teklif kayıtları (gün)** | Rakiplerin teklif kayıtları. |
| **Takip edilen ürün kayıtları (gün)** | Takip edilen ürünlerde okunan satıcı ve fiyatlar. |
| **Değerlendirme geçmişi (gün)** | Takip edilen ürünlerin değerlendirme geçmişi. |
| **Bilgi/debug olayları (gün)** | [Olaylar](/rehber/events) ekranındaki bilgi ve debug seviyesindeki kayıtlar. |
| **Uyarı/hata olayları (gün)** | Olaylar ekranındaki uyarı ve hata kayıtları. |
| **İş çalıştırma geçmişi (gün)** | [İşler](/rehber/jobs) ekranındaki çalışma geçmişi. |
| **Tamamlanmış iş kuyruğu satırları (gün)** | Bitmiş iş sırası kayıtları. |
| **Giriş kayıtları (gün)** | [Kullanıcılar](/rehber/users) bölümündeki giriş kayıtları. |
| **Kapanmış fiyat ihlalleri (gün)** | Sona ermiş fiyat bandı ihlalleri. |
| **Bildirim gönderim kayıtları (gün)** | Gönderilen bildirimlerin kayıtları. |

Her değer en az 1 gün olmalıdır. Değerleri değiştirip **Kaydet**'e tıklayın; **Saklama pencereleri kaydedildi.** mesajı görünür.

Kaydetmek yalnızca Yönetici rolüne açıktır. Diğer roller değerleri görebilir.

## Sık sorulanlar

**Süreyi kısalttım. Eski kayıtlar hemen silinir mi?**
Hayır, bir sonraki temizlikte silinir. Silinen kayıtlar geri getirilemez; kısaltmadan önce gerekirse listeleri **Excel'e Aktar** ile indirin.

**Süreyi uzattım ama eski kayıtları göremiyorum.**
Daha önce silinmiş kayıtlar geri gelmez. Uzatma yalnızca bundan sonraki kayıtları etkiler.

<!-- kaynak: doc 06 §9, doc 05 §10, doc 10 §5; apps/web/src/app/settings/retention/page.tsx, settings/retention/retention-client.tsx, app/api/settings/retention/route.ts, lib/labels.ts (JOB_LABELS PruneHistory) -->
