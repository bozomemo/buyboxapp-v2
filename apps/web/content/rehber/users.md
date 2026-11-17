---
id: users
title: Kullanıcılar
section: screens
order: 52
module: null
routes:
  - /settings/users
  - /settings/users/activity
---

**Kullanıcılar** ekranı, uygulamaya kimin giriş yapabileceğini ve ne yapabileceğini yönettiğiniz yerdir. Yeni bir çalışanı eklemek, birinin rolünü değiştirmek, ayrılan birinin erişimini kapatmak, unutulan bir parolayı sıfırlamak veya kilitlenen bir hesabı açmak için bu ekranı kullanırsınız. Her değişiklik giriş kayıtlarına işlenir.

Bu ekran ve **Giriş kayıtları** ekranı yalnızca Yönetici rolüne açıktır. Diğer roller **Ayarlar**'da **Kullanıcılar** sekmesini görmez.

## Kullanıcılar listesi

| Sütun | Ne gösterir |
|---|---|
| **Kullanıcı adı** | Girişte kullanılan ad. |
| **Ad Soyad** | Kişinin adı. |
| **Rol** | **Yönetici**, **Fiyat Yöneticisi** veya **İzleyici**. Listeden seçince rol hemen değişir. |
| **Durum** | **Etkin** veya **Devre dışı**. Ayrıca **Kilitli** (çok sayıda hatalı giriş nedeniyle geçici olarak kilitli) ve **Geçici parola** (kullanıcı henüz kendi parolasını belirlemedi) etiketleri görünebilir. |
| **2 adımlı** | Kurulu doğrulama yöntemleri: **Uygulama**, **SMS** ya da **yok**. |
| **Son giriş** | En son ne kadar önce giriş yaptığı. |
| **İşlemler** | Aşağıdaki düğmeler. |

### İşlemler

- **Devre dışı bırak**: kullanıcı artık giriş yapamaz ve tüm oturumları hemen kapanır. Onay istenir. Hesap silinmez; geçmişteki işlemleri kayıtlı kalır.
- **Etkinleştir**: devre dışı bir hesabı yeniden açar.
- **Parolayı sıfırla**: satırın altında bir form açılır. **Geçici parola** alanına en az 10 karakterlik bir parola girin ve **Kaydet**'e tıklayın. Geçici parolayı kullanıcıya kendiniz iletin; ilk girişte yenisini belirlemesi istenir. **Vazgeç** formu kapatır.
- **2 adımlıyı sıfırla**: kullanıcının iki adımlı doğrulamasını kaldırır ve tüm oturumlarını kapatır. Bir sonraki girişte yeniden kurması gerekir. Telefonunu kaybeden kullanıcı için kullanılır. Onay istenir.
- **Kilidi kaldır**: yalnızca **Kilitli** hesaplarda görünür. Kilidi süresinin dolmasını beklemeden açar.

### Son yönetici koruması

Kurulumda en az bir etkin Yönetici kalmalıdır. Son etkin Yöneticinin rolü değiştirilemez ve hesabı devre dışı bırakılamaz; bu kontroller soluk görünür. Önce başka bir kullanıcıyı Yönetici yapın. Her kurulumda en az iki Yönetici tutmanızı öneririz.

## İki adımlı doğrulama

**Herkes için zorunlu** kutusu işaretlenirse, iki adımlı doğrulaması olmayan her kullanıcı bir sonraki işleminde doğrulama kurulum ekranına yönlendirilir. Kurulum ağ üzerinden erişiliyor ve kullanıcılar yalnızca parolayla giriyorsa, kutunun altında bunu belirten bir uyarı görünür; bu durumda kutuyu açmanızı öneririz.

## Yeni kullanıcı

1. **Kullanıcı adı** girin: 3-32 karakter; küçük harf (a-z), rakam (0-9), nokta (.), alt çizgi (_) ve tire (-) kullanılabilir.
2. **Ad Soyad** girin.
3. **Rol** seçin.
4. **Geçici parola** girin (en az 10 karakter).
5. İsterseniz **Telefon (isteğe bağlı)** girin. SMS ile doğrulama için kullanılır; numarayı kullanıcı kendisi doğrular.
6. **Kullanıcı oluştur**'a tıklayın.

Geçici parolayı kullanıcıya kendiniz iletin. Kullanıcı ilk girişte kendi parolasını belirler.

## Roller

Ekranın altındaki tablo, her rolün hangi yetkilere sahip olduğunu gösterir. Satırlar yetkilerdir (**Tüm ekranları görüntüleme**, **Otomasyonu durdurma**, **Fiyat ve stok yönetimi**, **Takip listeleri ve marka yönetimi**, **İşleri çalıştırma**, **Ayarlar ve bağlantılar**, **Kullanıcı yönetimi**), sütunlar rollerdir. ✓ işareti o rolün o yetkiye sahip olduğunu gösterir. Ayrıntılar için bkz. [Roller ve Yetkiler](/rehber/concepts-roles).

## Giriş kayıtları

Sayfanın üstündeki **Giriş kayıtları →** bağlantısı bu ekranı açar. Girişler, başarısız denemeler ve kullanıcı yönetimi işlemleri burada listelenir. Kayıtlar 365 gün saklanır; parola, kod veya anahtar asla kaydedilmez.

- **Olay** listesinden bir olay türü seçerek süzebilirsiniz (ör. **Giriş başarısız**, **Parola sıfırlandı**, **Rol değiştirildi**).
- Sütunlar: **Zaman**, **Olay**, **Kullanıcı** (olayın ilgili olduğu kişi), **Yapan** (işlemi yapan kişi), **Ayrıntı** ve **Adres** (bağlantının geldiği ağ adresi; üzerine gelince tarayıcı bilgisi görünür).
- Başarısız girişlerde **Ayrıntı** nedenini söyler: **kullanıcı yok**, **parola yanlış**, **hesap kilitli**, **hesap devre dışı** veya **adres engelli**. Bu nedenler giriş ekranında kullanıcıya gösterilmez, yalnızca burada görünür.
- **Daha yeni** ve **Daha eski** ile sayfalar arasında gezinin. **Excel'e Aktar** görünen kayıtları indirir.
- **← Kullanıcılar** ile listeye dönersiniz.

## Sık sorulanlar

**Bir çalışan şirketten ayrıldı. Hesabını silmeli miyim?**
Hesaplar silinmez; **Devre dışı bırak**'a tıklayın. Kişi giriş yapamaz ve geçmişteki işlemleri kayıtlı kalır.

**Kullanıcı "Kullanıcı adı veya parola hatalı" diyor ama parolası doğru.**
Satırında **Kilitli** etiketi varsa **Kilidi kaldır**'a tıklayın. Nedenini **Giriş kayıtları** ekranında **Ayrıntı** sütununda görebilirsiniz. Bkz. [Giriş ve İlk Yönetici](/rehber/sign-in).

**Kullanıcı telefonunu kaybetti, doğrulama kodu alamıyor.**
Önce kurtarma kodu olup olmadığını sorun. Yoksa **2 adımlıyı sıfırla**'ya tıklayın.

**Rol değişikliği ne zaman geçerli olur?**
Rolü listeden seçtiğiniz anda kaydedilir.

<!-- kaynak: doc 18 §3, §5.1, §6.2, §9.2, doc 06 §10.4; apps/web/src/app/settings/users/page.tsx, settings/users/users-client.tsx, settings/users/activity/page.tsx, settings/users/activity/activity-client.tsx, packages/shared/src/auth/permissions.ts, app/api/users/*/route.ts -->
