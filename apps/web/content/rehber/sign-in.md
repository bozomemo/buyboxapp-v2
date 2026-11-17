---
id: sign-in
title: Giriş ve İlk Yönetici
section: screens
order: 54
module: null
routes:
  - /login
  - /login/mfa
  - /bootstrap
---

Bu bölüm giriş ekranlarını ve bir kullanıcı giriş yapamadığında **yöneticinin** ne yapacağını anlatır. Giriş yapamayan kullanıcı bu rehberi okuyamaz; giriş ekranında ona yöneticisine başvurmasını söyleyen kısa bir not vardır.

## Giriş yapmak

1. **Kullanıcı adı** ve **Parola** alanlarını doldurup **Giriş yap**'a tıklayın.
2. İki adımlı doğrulama açıksa **İki adımlı doğrulama** ekranı gelir. Yöntem seçin ve kodu girip **Doğrula**'ya tıklayın:
   - **Doğrulama uygulaması**: telefonunuzdaki uygulamanın gösterdiği 6 haneli kod.
   - **SMS ile kod**: **Kod gönder**'e tıklayın, kayıtlı numaranıza gelen kodu girin.
   - **Kurtarma kodu**: telefonunuz yanınızda değilse, doğrulamayı kurarken kaydettiğiniz kodlardan biri. Her kod bir kez kullanılır.
3. **Bu cihazı … gün hatırla** kutusunu işaretlerseniz o cihazdan bu süre boyunca kod sorulmaz.

Hata mesajı her zaman aynıdır: _Kullanıcı adı veya parola hatalı._ Güvenlik için hangisinin yanlış olduğu ya da hesabın kilitlendiği söylenmez.

Doğrulama adımı 5 dakika ve 5 deneme ile sınırlıdır. Süre dolarsa **Doğrulama süresi doldu** ekranında **Yeniden giriş yap**'a tıklayın.

## Hesap kilitlenmesi

Bir kullanıcı adıyla 15 dakika içinde 5 kez hatalı giriş yapılırsa (yanlış doğrulama kodları da sayılır) o hesap **15 dakika kilitlenir**. Süre bitince kendiliğinden açılır.

Beklemek istemiyorsanız yönetici kilidi hemen kaldırabilir: **Ayarlar → Kullanıcılar** ekranında kullanıcının satırında **Kilitli** etiketi görünür; aynı satırdaki **Kilidi kaldır**'a tıklayın.

## Kullanıcı parolasını unuttu

Uygulamada "parolamı unuttum" bağlantısı yoktur; parolayı yönetici sıfırlar.

1. **Ayarlar → Kullanıcılar** ekranını açın.
2. Kullanıcının satırında **Parolayı sıfırla**'ya tıklayın.
3. Önerilen **Geçici parola**yı kullanın ya da kendiniz yazın (en az 10 karakter), **Kaydet**'e tıklayın.
4. Geçici parolayı kullanıcıya kendiniz iletin. Kullanıcı ilk girişte yeni bir parola belirlemek zorundadır; satırında o zamana kadar **Geçici parola** etiketi görünür.

## Kullanıcı telefonunu kaybetti (doğrulama kodu yok)

Önce kullanıcının bir **kurtarma kodu** olup olmadığını sorun; varsa doğrulama ekranında **Kurtarma kodu** yöntemiyle girebilir.

Yoksa:

1. **Ayarlar → Kullanıcılar** ekranında kullanıcının satırında **2 adımlıyı sıfırla**'ya tıklayın ve onaylayın.
2. Kullanıcının tüm oturumları kapanır. Bir sonraki girişinde iki adımlı doğrulamayı yeniden kurması istenir.

Bu işlemler **Yönetici** rolüne açıktır.

## Yöneticinin kendisi giriş yapamıyorsa

Başka bir **Yönetici** rolündeki kullanıcı yukarıdaki adımlarla parolanızı veya doğrulamanızı sıfırlayabilir. Tek yönetici sizseniz ve giriş yapamıyorsanız kurulumu yapan kişiye başvurun. Bu nedenle her kurulumda en az iki yönetici hesabı tutmanızı öneririz.

## İlk yönetici (kurulumdan hemen sonra)

Yeni bir kurulumda henüz kullanıcı yoktur ve uygulama sizi **İlk yönetici** ekranına götürür.

1. Veritabanı henüz yapılandırılmadıysa önce **Önce veritabanı** ekranı gelir; kurulumu yapan kişi bu adımı tamamlar.
2. **Kurulum anahtarı** istenir. Anahtar sunucudaki bir dosyadadır; ekran dosyanın yerini gösterir. Kurulumu yapan kişiden alın.
3. **İlk yöneticiyi oluşturun** formunda **Kullanıcı adı**, **Ad Soyad**, **Parola** ve **Parola (tekrar)** alanlarını doldurun. Parola en az 10 karakter olmalıdır.

Bu hesap tüm ayarlara ve kullanıcı yönetimine erişir. Ardından [Kurulumdan Sonra İlk Adımlar](/rehber/start) bölümüne geçin.

## Sık sorulanlar

**Giriş ekranında "Kullanıcı adı veya parola hatalı" diyor ama parolam doğru.**
Hesabınız kilitlenmiş olabilir; mesaj bunu söylemez. 15 dakika bekleyin ya da yöneticinizden **Kilidi kaldır** istemesini isteyin.

**Kurtarma kodlarımı nerede bulurum?**
İki adımlı doğrulamayı kurarken bir kez gösterilirler. Kaybettiyseniz giriş yaptıktan sonra **Hesabım** ekranındaki **İki adımlı doğrulama** bölümünde **Yeniden oluştur**'a tıklayarak yenilerini alabilirsiniz; eskiler geçersiz olur. Bkz. [Hesabım](/rehber/account).

**Yeni bir çalışanı nasıl eklerim?**
Bkz. [Kullanıcılar](/rehber/users).

<!-- kaynak: doc 18 §3.2, §3.3, §5, §8.1; doc 19 §9; apps/web/src/app/login, login/mfa, bootstrap, settings/users/users-client.tsx -->
