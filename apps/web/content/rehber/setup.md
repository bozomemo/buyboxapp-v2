---
id: setup
title: Kurulum Sihirbazı
section: screens
order: 55
module: null
routes:
  - /setup
---

**Kurulum Sihirbazı**, yeni bir kurulumu kullanıma hazırlamak için gereken ayarları adım adım sorar. Genellikle kurulumdan hemen sonra, bir kez kullanılır. Sihirbazdaki her ayarı daha sonra [Ayarlar](/rehber/settings) ekranının sekmelerinden de değiştirebilirsiniz.

Sihirbaz yalnızca Yönetici rolüne açıktır. Sayfanın üstünde hangi adımda olduğunuz yazar (ör. **Adım 3 / 9 — Mağaza Kimliği**) ve tüm adımlar bir şerit halinde görünür; tamamlananların başında ✓ işareti vardır. Her adımın altında **Geri** ve **İleri** düğmeleri bulunur. Bir adımda gerekli kayıt yapılmadan **İleri** açılmaz.

Sihirbazı yarıda bırakabilirsiniz. Geri döndüğünüzde kaldığınız adımdan devam edersiniz; o ana kadar kaydettikleriniz korunur. Her adımın altındaki not, o adımda kaydetmeden çıkarsanız ne olacağını söyler.

## Adımlar

Hangi adımları göreceğiniz, **Kullanım Amacı** adımındaki seçiminize bağlıdır. Yalnızca marka izleme seçerseniz satıcıya ait adımlar (Mağaza Kimliği, Ücret Ayarları, Fiyatlandırma Politikası, Ürün Kaynağı, ERP Bağlantısı) gösterilmez.

### 1. Veritabanı

Uygulamanın verilerini saklayacağı veritabanı. Bu adımı genellikle kurulumu yapan kişi tamamlar; değerlerden emin değilseniz kurulumu yapan kişiye başvurun.

- **Veritabanı Motoru**: **SQLite (tek kullanıcılı yerel kurulum için önerilir)**, **PostgreSQL** veya **MySQL**.
- **Bağlantı Bilgisi**: veritabanının adresi. Kurulum zaten bir veritabanı kullanıyorsa alan dolu gelir ve değiştirmeniz gerekmez.
- **Bağlantıyı Test Et**: bağlantının çalıştığını doğrular.
- **Migrasyonları Çalıştır**: veritabanı yapısını hazırlar. **Şema güncel** mesajını görünce **İleri**'ye tıklayın.

Bu adım sihirbaza her dönüşünüzde yeniden onaylanır.

### 2. Kullanım Amacı

Bu kurulumu ne için kullanacağınızı seçin; ikisini birden seçebilirsiniz:

- **Pazaryeri satıcısıyım**: kendi ilanlarınızın fiyatını buybox'a göre otomatik ayarlamak için. Pazaryeri API bilgileri, ücret ve fiyat politikası adımları sorulur.
- **Marka ürün yöneticisiyim**: markanızın ürünlerini pazaryerinde kimin, hangi fiyata sattığını izlemek için. API bilgisi gerekmez.

En az birini seçin. Seçiminizi sonradan [Modüller](/rehber/settings-modules) ekranından değiştirebilirsiniz.

### 3. Mağaza Kimliği

**Mağaza Görünen Adı**: raporlarda ve uyarılarda kullanılan mağaza adı. Fiyatlandırmayı etkilemez. Kaydedip **İleri**'ye tıklayın.

### 4. Pazaryerleri

**Satıcı modülü seçiliyse**: her pazaryeri için **Etkin** kutusunu ayarlayın. Etkin bıraktığınız her pazaryeri için **Ortam (Environment)** seçin, bağlantı bilgilerini girin, **Bağlantıyı Test Et** ile doğrulayın ve **Kaydet**'e tıklayın. **Kimlik bilgileri şifreli olarak kaydedildi.** mesajı görünür. Bağlantı testi başarısız olan bilgiler kaydedilmez. Bilgiler kaydedildikten sonra bir daha gösterilmez. Daha önce kaydettiyseniz bunu belirten bir not görünür; alanları boş bırakıp devam edebilirsiniz. Devre dışı bıraktığınız bir pazaryeri sonraki adımlarda atlanır ve ona fiyat gönderilmez. Alanların anlamı için bkz. [Pazaryerleri](/rehber/settings-marketplaces).

**Yalnızca marka modülü seçiliyse**: izlemek istediğiniz pazaryerlerini işaretleyin. En az birini seçin.

### 5. Ücret Ayarları

Etkin her pazaryeri için **Varsayılan Komisyon Oranı (%)**, **Kargo Bantları** ve **Gider Bantları** girin. **Dip Fiyat Önizle** ile 100 TL maliyetli bir ürünün taban fiyatını görün, ardından **Kaydet**'e tıklayın. Tutarları KDV dahil, faturadaki gibi girin; uygulama KDV hesaplamaz. Ayrıntılar: [Ücretler](/rehber/settings-fees).

### 6. Fiyatlandırma Politikası

Etkin her pazaryeri için fiyatlandırma ayarlarını girip **Kaydet**'e tıklayın. Politika **otomasyon kapalı** olarak kaydedilir; **Politika kaydedildi (otomasyon kapalı).** mesajı görünür. Otomasyonu kurulum bittikten sonra pazaryeri bazında siz açarsınız. Alanların anlamı: [Fiyat Politikası](/rehber/settings-policy).

### 7. Ürün Kaynağı

Stok kodlarının ve maliyetlerin nereden geleceğini seçin: **Manuel (Stok ekranından tek tek eklenir)**, **Excel** veya **Pazaryeri listelerinden**. Excel seçerseniz dosyayı seçip sütun başlıklarını girin, **İlk 20 Satırı Önizle** ile kontrol edin ve **Kaydet**'e tıklayın. Ayrıntılar: [Ürün Kaynakları](/rehber/settings-product-sources).

### 8. ERP Bağlantısı

Bu adımda şu an yapılacak bir ayar yoktur. **Atla**'ya tıklayın.

### 9. Gözden Geçir ve Bitir

Yapılan ayarların özeti gösterilir. **Kurulumu Bitir**'e tıklayın; **Kurulum tamamlandı. Panele yönlendiriliyorsunuz…** mesajından sonra [Panel](/rehber/panel) açılır.

- Satıcı kurulumunda otomasyon her pazaryerinde **kapalı** başlar. Uygulama ilanları içe aktarır ve gözlemler ama fiyat göndermez.
- Yalnızca marka kurulumunda hiçbir pazaryerine fiyat gönderilmez. Tarama işleri kapalı başlar; [İzlenen Markalar](/rehber/watched-brands) ekranından markanızı ekledikten sonra [İşler](/rehber/jobs) ekranından açabilirsiniz.

**Kurulumu Bitir**'e tıklamazsanız kaydettikleriniz durur, ama kurulum tamamlanmış sayılmaz ve Panel bunu göstermeye devam eder.

## Sık sorulanlar

**Sihirbazı bitirdim. Şimdi ne yapmalıyım?**
[Kurulumdan Sonra İlk Adımlar](/rehber/start) bölümündeki sırayı izleyin. Otomasyonu açmadan önce ilanlarınızın ve maliyetlerinizin doğru geldiğini kontrol edin.

**İleri düğmesi açılmıyor.**
O adımda gerekli kayıt yapılmamıştır. Etkin her pazaryeri için **Kaydet**'e bastığınızdan ve kaydedildi mesajını gördüğünüzden emin olun.

**Bir adımda yanlış değer girdim.**
**Geri** ile o adıma dönüp düzeltin ya da kurulum bittikten sonra [Ayarlar](/rehber/settings) ekranından değiştirin.

<!-- kaynak: doc 10 §6, doc 17 §1.4, doc 02 §0, doc 06 §9; apps/web/src/app/setup/page.tsx, setup/setup-wizard.tsx, setup/wizard-types.ts, setup/steps/*.tsx, components/ui.tsx (StepFooter) -->
