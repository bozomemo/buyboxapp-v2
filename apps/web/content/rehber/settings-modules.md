---
id: settings-modules
title: Modüller
section: screens
order: 47
module: null
routes:
  - /settings/modules
---

**Modüller** sekmesi, bu kurulumun hangi işleri yapacağını belirler. Kapalı bir modülün menüsü gizlenir, ekranları açılmaz ve arka plan işleri çalışmaz. Hiçbir veri silinmez; modülü tekrar açtığınızda kaldığı yerden devam eder.

Kapalı bir modüle ait bir ekranı açmaya çalışırsanız uygulama sizi bu sekmeye getirir ve üstte bir uyarı gösterir: **Açmaya çalıştığınız ekran "…" modülüne ait ve bu modül kapalı.**

## Modüller

Her modülün bir onay kutusu vardır:

- **Pazaryeri satıcısı**: kendi ilanlarınız, maliyet ve komisyon hesabı, otomatik fiyatlandırma ve fiyat gönderimi. Stok, İlanlar, Markalar, Rakip Geçmişi, Rakip Satıcılar ve Alarmlar ekranları bu modüldedir. Ayarlarda **Ücretler**, **Politika** ve **Ürün Kaynakları** sekmeleri de bu modüle aittir.
- **Marka ürün yöneticisi**: markanızın ürünlerini kimin, hangi fiyata sattığını izleme. Marka Denetimi altındaki Stok, İlanlar, Alarmlar ve Kâr Ayarları ile İzlenen Markalar, Takip Edilen Ürünler, Marka Satıcıları, Satıcı Politikası, Denetim Bulguları, Pazaryeri Eşleşmesi ve Marka Karşılaştırması ekranları bu modüldedir.

İkisini birden açabilirsiniz. En az bir modül açık kalmalıdır; ikisinin de işaretini kaldırırsanız **En az bir modül açık kalmalı.** uyarısı çıkar ve kaydedemezsiniz.

## Değişikliği kaydetmek

Kutuları değiştirdikten sonra **Kaydet**'e tıklayın.

### Satıcı modülünü kapatmak

Satıcı modülünün işaretini kaldırdığınızda bir uyarı belirir. Kapatmak:

- fiyat kararlarını ve fiyat gönderimini hemen durdurur,
- fiyat gönderim anahtarını devreye alır.

**Kaydet** bu durumda bir onay ister. Modülü sonradan açtığınızda gönderim kendiliğinden başlamaz; [Panel](/rehber/panel) ekranındaki fiyat gönderim anahtarını siz kapatana kadar bekler. Bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop).

Satıcı modülü kapalıyken pazaryeri onayı bekleyen fiyat gönderimleri varsa ekranda kaç tane olduğu yazar. Bunlar sonuçlanana kadar onay işi çalışmaya devam eder; böylece gönderilmiş bir fiyat değişikliği kayıtsız kalmaz.

## Kim değiştirebilir?

Modülleri kaydetmek yalnızca Yönetici rolüne açıktır. Diğer roller hangi modüllerin açık olduğunu görebilir.

## Sık sorulanlar

**Marka modülünü kapatırsam izlediğim markalar silinir mi?**
Hayır. Ekranlar gizlenir ve tarama işleri durur; veriler kalır. Modülü açınca kaldığı yerden devam eder.

**Satıcı modülünü yeniden açtım ama fiyatlar gönderilmiyor.**
Modül kapatılırken fiyat gönderim anahtarı devreye alınmıştır. [Panel](/rehber/panel) ekranından bu anahtarı kapatın.

**Bir menü bölümü tamamen kayboldu.**
O bölüm kapalı bir modüle aittir. Bu sekmeden modülü açabilirsiniz.

<!-- kaynak: doc 17 §1.3, §1.4, doc 15 §3.6; apps/web/src/app/settings/modules/page.tsx, settings/modules/modules-client.tsx, app/api/modules/route.ts -->
