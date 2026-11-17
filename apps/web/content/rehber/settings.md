---
id: settings
title: Ayarlar
section: screens
order: 42
module: null
routes:
  - /settings
---

**Ayarlar** ekranı, kurulumun bütün ayar bölümlerine giden kapıdır. Bir bölüm seçtiğinizde üstte aynı sekme çubuğu kalır, böylece bölümler arasında kolayca geçebilirsiniz. Her ayar değişikliği denetim kaydına işlenir: kim, ne zaman, eski ve yeni değer.

## Sekmeler

| Sekme | Ne için | Rehber |
|---|---|---|
| **Modüller** | Kurulumun hangi işleri yapacağı: pazaryeri satıcısı, marka ürün yöneticisi veya ikisi. | [Modüller](/rehber/settings-modules) |
| **Pazaryerleri** | Trendyol ve Hepsiburada'yı açıp kapatma, bağlantı bilgileri. | [Pazaryerleri](/rehber/settings-marketplaces) |
| **Ücretler** | Komisyon, kargo ve gider tutarları. | [Ücretler](/rehber/settings-fees) |
| **Politika** | Fiyatlandırma stratejisi ve otomasyon anahtarı. | [Fiyat Politikası](/rehber/settings-policy) |
| **Ürün Kaynakları** | Stok kodlarının ve maliyetlerin nereden geldiği. | [Ürün Kaynakları](/rehber/settings-product-sources) |
| **Bildirimler** | Fiyat bandı ihlali bildirimlerinin kanalları ve alıcıları. | [Bildirimler](/rehber/settings-notifications) |
| **Saklama** | Geçmiş kayıtların kaç gün tutulacağı. | [Veri Saklama](/rehber/settings-retention) |
| **Veritabanı** | Veritabanı bağlantısının ve şemanın durumu. | [Veritabanı](/rehber/settings-database) |
| **Lisans** | Lisans durumu ve yeni anahtar girişi. | [Lisans](/rehber/license) |
| **Kullanıcılar** | Kullanıcılar, roller ve giriş kayıtları. | [Kullanıcılar](/rehber/users) |
| **Güncelleme** | Yeni sürümü kontrol etme ve kurma. | [Güncelleme](/rehber/settings-update) |

## Neden bazı sekmeleri göremiyorum?

- **Ücretler**, **Politika** ve **Ürün Kaynakları** pazaryeri satıcısı modülüne aittir. Bu modül kapalıysa sekmeler gizlenir.
- **Kullanıcılar** sekmesi yalnızca Yönetici rolüne görünür.
- **Güncelleme** sekmesi yalnızca Yönetici rolüne görünür.

## Kim ne değiştirebilir?

Ayar ekranlarını tüm roller görebilir. Ayarları kaydetmek (**Kaydet**, **Bağlantıyı Test Et**, **Test gönder** gibi düğmeler) yalnızca Yönetici rolüne açıktır. Fiyat Yöneticisi ve İzleyici değerleri görür ama kaydedemez. Bkz. [Roller ve Yetkiler](/rehber/concepts-roles).

## Sık sorulanlar

**Bir ayarı kimin değiştirdiğini nasıl öğrenirim?**
Her değişiklik denetim kaydına yazılır. Ücret ayarlarında eski değerler **Ücretler** ekranının **Geçmiş** bölümünde de görünür.

**Kaydet'e bastım ama "yetkiniz yok" gibi bir hata aldım.**
Ayarları yalnızca Yönetici rolü kaydedebilir. Yöneticinizden değişikliği yapmasını isteyin.

**Kurulum sihirbazına tekrar dönebilir miyim?**
Evet; sihirbaz ayarları ilk kez toplu girmek içindir, ama aynı ayarların hepsi buradaki sekmelerden de değiştirilebilir. Bkz. [Kurulum Sihirbazı](/rehber/setup).

<!-- kaynak: doc 06 §9, doc 17 §1.3, doc 18 §6.2; apps/web/src/app/settings/page.tsx, settings/settings-tabs.tsx, settings/settings-nav.tsx, app/api/settings/*/route.ts -->
