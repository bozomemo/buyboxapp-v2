---
id: concepts-roles
title: Roller ve Yetkiler
section: concepts
order: 6
module: null
routes: []
---

Her kullanıcının tek bir rolü vardır. Rol, kullanıcının neleri görebileceğini ve değiştirebileceğini belirler. Rolleri **Yönetici** rolündeki kullanıcılar **Ayarlar → Kullanıcılar** ekranından atar.

## Üç rol

| | Yönetici | Fiyat Yöneticisi | İzleyici |
|---|:-:|:-:|:-:|
| Tüm ekranları görmek, Excel/CSV indirmek | ✓ | ✓ | ✓ |
| Otomasyonu ve fiyat gönderimini durdurmak | ✓ | ✓ | |
| Fiyat, stok ve otomasyon ayarları; durdurulanı yeniden açmak | ✓ | ✓ | |
| Katalog: takip edilen ürünler, izlenen markalar, marka ürünleri, satıcı politikaları, alarm kuralları | ✓ | ✓ | |
| İşleri elle çalıştırmak, açıp kapatmak | ✓ | ✓ | |
| Ayarlar: ücretler, politika, modüller, pazaryerleri, veritabanı, lisans, güncelleme | ✓ | | |
| Kullanıcı yönetimi ve giriş kayıtları | ✓ | | |

- **İzleyici** yalnızca görüntüler. Otomasyonu durduramaz da.
- Yetkiniz olmayan düğmeler ekranda pasif (gri) görünür; üzerine geldiğinizde nedeni yazar.
- Yetkiniz olmayan bir ekranı açarsanız _Bu sayfayı görüntüleme yetkiniz yok_ mesajı çıkar.

## Güvenlik notları

- Pazaryeri şifreleri ve anahtarları **hiçbir rol için** geri gösterilmez, yönetici için bile. Yalnızca yenisi girilebilir.
- Son etkin yönetici devre dışı bırakılamaz ve rolü değiştirilemez; böylece kurulum yöneticisiz kalmaz.
- Her değişiklik, yapan kullanıcının adıyla kaydedilir.

## Sık sorulanlar

**Bir çalışanın sadece raporları görmesini istiyorum.**
Ona **İzleyici** rolü verin.

**Fiyat yöneticimin ayarları değiştirememesi doğru mu?**
Evet. Ücretler, politika ve pazaryeri bağlantıları gibi ayarlar yalnızca **Yönetici** rolüne açıktır.

<!-- kaynak: doc 18 §6.1, §6.2, §6.3, §9; apps/web/src/lib/server/auth/page-guard.tsx -->
