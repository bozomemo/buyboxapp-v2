---
id: settings-marketplaces
title: Pazaryerleri
section: screens
order: 46
module: null
routes:
  - /settings/marketplaces
---

**Pazaryerleri** sekmesinde Trendyol ve Hepsiburada'yı açıp kapatırsınız. Pazaryeri satıcısı modülü açıksa, mağazanızın pazaryeri bağlantı bilgilerini de burada girer ve test edersiniz. Bu ekranı kurulumda, bağlantı bilgileriniz değiştiğinde ya da bir pazaryerini geçici olarak devre dışı bırakmak istediğinizde açarsınız.

Her pazaryeri ayrı bir kartta görünür. Kartın başlığında son kaydın zamanı (**Son güncelleme**) ve **Etkin** kutusu vardır.

## Etkin kutusu

- **Etkin** işaretliyse o pazaryeri için arka plan işleri çalışır.
- Pazaryeri satıcısı modülü açıkken kutuyu işaretlemek bir onay ister: **… etkinleştirilsin mi?** Onaylarsanız uygulama o pazaryerine gerçek fiyat göndermeye başlayabilir. **Etkinleştir**'e tıklayın.
- İşareti kaldırmak onay istemez.
- Değişikliğin geçerli olması için kartın **Kaydet** düğmesine tıklayın.

## Satıcı modülü açıkken

### Satıcı Referansı (merchantRef)

Mağazanızın o pazaryerindeki satıcı kodunu gösterir. Bu alan elle girilmez: bağlantı bilgilerindeki satıcı kodundan (Trendyol'da **Satıcı Kimliği (sellerId)**, Hepsiburada'da **Merchant ID**) otomatik belirlenir ve her ilan içe aktarımında doğrulanır. Uygulama kendi teklifinizi rakiplerinkinden bu kodla ayırır. Henüz belirlenmediyse **— henüz belirlenmedi —** yazar.

### Bağlantı bilgileri

Bağlantı bilgileri güvenlik nedeniyle **hiçbir zaman ekranda gösterilmez**; daha önce kaydettiyseniz bile alanlar boş görünür. Yalnızca doldurduğunuz alanlar kaydedilir; boş bıraktığınız alanlar kayıtlı değeri korur. Alanlarda **değiştirmek için doldurun** yazar.

- **Ortam (Environment)**: **Prod** gerçek mağazanızdır. **Test** seçenekleri pazaryerinin deneme ortamıdır; günlük kullanımda **Prod** seçili olmalıdır.
- Trendyol: **API Anahtarı**, **API Gizli Anahtarı**, **Satıcı Kimliği (sellerId)**, **User-Agent Eki (opsiyonel)**.
- Hepsiburada: **Mağaza Kullanıcı Adı**, **Şifre**, **Merchant ID**.

Bu bilgileri pazaryerinin satıcı panelinden alırsınız. Gizli alanlar yazarken de gizlenir.

### Test etme ve kaydetme

1. Değiştirmek istediğiniz alanları doldurun.
2. **Bağlantıyı Test Et**'e tıklayın. Uygulama pazaryerine gerçek bir okuma isteği gönderir ve sonucu yeşil (başarılı) ya da kırmızı (hata) bir mesajla gösterir. Test hiçbir fiyatı değiştirmez.
3. Test başarılıysa **Kaydet**'e tıklayın. **Kaydedildi.** mesajı görünür.

## Yalnızca marka modülü açıkken

Kartta bağlantı bilgisi alanları görünmez. Marka izleme için bu pazaryerinde bağlantı bilgisi gerekmez. Yalnızca **Etkin** kutusunu ayarlayıp **Kaydet**'e tıklarsınız. Kapalı bir pazaryerindeki markalar taranmaz.

## Kim değiştirebilir?

**Bağlantıyı Test Et** ve **Kaydet** yalnızca Yönetici rolüne açıktır. Diğer roller ekranı görebilir ama bağlantı bilgilerini göremez; bunları Yönetici de göremez.

## Sık sorulanlar

**Kayıtlı API anahtarımı nereden görebilirim?**
Göremezsiniz. Bilgiler kaydedildikten sonra uygulama bunları geri göstermez. Anahtarı pazaryerinin satıcı panelinden yeniden alıp buraya girebilirsiniz.

**Yalnızca şifreyi değiştirmek istiyorum. Diğer alanları da yeniden girmem gerekir mi?**
Hayır. Yalnızca şifre alanını doldurup test edin ve kaydedin; boş alanlar kayıtlı değerlerini korur.

**Bağlantı testi hata veriyor.**
Mesaj neyin yanlış olduğunu söyler:

- **… bilgileri kabul etmedi (HTTP 401 / 403)**: Pazaryeri giriş bilgilerini reddetti. Mesajda sayılan alanları satıcı panelindekiyle karşılaştırın. **Ortam (Environment)** olarak Test seçiliyse bilgilerin test ortamına ait olması gerekir; gerçek mağazanız için **Prod** seçin.
- **… istenen kayıt bulunamadı (HTTP 404)**: Satıcı Kimliği ya da Merchant ID yanlış.
- **Çok fazla istek (HTTP 429)** ya da **… şu anda yanıt vermiyor (HTTP 5xx)**: Sorun pazaryeri tarafında; birkaç dakika sonra yeniden deneyin.
- **… bağlanılamadı**: Sunucu pazaryerine ulaşamıyor. İnternet bağlantısını kontrol edin; sürerse kurulumu yapan kişiye başvurun.

**Bir pazaryerini kapatırsam ne olur?**
O pazaryeri için içe aktarma, gözlem ve fiyat gönderimi durur. Kayıtlı bilgiler silinmez; yeniden açtığınızda kaldığı yerden devam eder.

<!-- kaynak: doc 06 §9, doc 08, doc 15 §3.6, doc 17 §1.4; apps/web/src/app/settings/marketplaces/page.tsx, settings/marketplaces/marketplaces-client.tsx, app/api/settings/marketplaces/route.ts, app/api/setup/marketplace/test/route.ts -->
