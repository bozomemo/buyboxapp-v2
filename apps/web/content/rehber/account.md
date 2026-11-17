---
id: account
title: Hesabım
section: screens
order: 53
module: null
routes:
  - /account
  - /account/password
  - /account/mfa-setup
---

**Hesabım** ekranı her kullanıcının kendi hesabıdır: parolanızı değiştirir, iki adımlı doğrulamanızı kurar veya yönetir, açık oturumlarınızı ve hatırlanan cihazlarınızı görürsünüz. Ekrana menüde görünen adınıza tıklayarak ulaşırsınız. Her rol bu ekranı kullanabilir.

Sayfanın üstünde adınız, kullanıcı adınız, rolünüz ve son giriş zamanınız yazar.

## Parola

**Parolayı değiştir** bağlantısı parola ekranını açar. Parolanız değişince diğer tüm cihazlardaki oturumlarınız kapanır.

1. **Mevcut parola** alanına şimdiki parolanızı girin.
2. **Yeni parola** girin (en az 10 karakter).
3. **Yeni parola (tekrar)** alanına aynı parolayı yeniden girin. İkisi farklıysa **Parolalar aynı değil.** uyarısı çıkar.
4. **Parolayı değiştir**'e tıklayın. **Vazgeç** sizi geri götürür.

### Geçici parola ile ilk giriş

Yöneticiniz size geçici bir parola verdiyse, girişten hemen sonra bu ekran açılır ve devam etmeden önce kendi parolanızı belirlemeniz istenir. İlk alanın adı bu durumda **Geçici parola**'dır; yöneticinin verdiği parolayı buraya girin.

## İki adımlı doğrulama

İki adımlı doğrulama, parolanız ele geçse bile hesabınızı korur. Girişte paroladan sonra bir kod daha istenir.

- **Doğrulama uygulaması**: **etkin** veya **kurulmadı**. Kurmak için **Kur**'a, kaldırmak için **Kaldır**'a tıklayın.
- **SMS**: SMS sağlayıcısı ayarlıysa görünür. **etkin** ise kayıtlı numaranızın bir kısmı gösterilir ve **Kaldır** düğmesi vardır. **kurulmadı** ise:
  1. **Cep telefonu** alanına numaranızı girip **Kod gönder**'e tıklayın.
  2. Gelen kodu "… numarasına gelen kod" alanına girip **Doğrula**'ya tıklayın. Yanlış numara girdiyseniz **Numarayı değiştir**'e tıklayın.
- **Kurtarma kodları**: kaç kullanılmamış kodunuz kaldığını gösterir. 3 veya daha az kaldıysa **yenilemeniz önerilir** uyarısı çıkar. **Yeniden oluştur** yeni kodlar verir; eskiler geçersiz olur.

**Kaldır** ve **Yeniden oluştur** işlemleri parolanızı ister: **Parola** alanına girip **Onayla**'ya tıklayın. SMS doğrulamasını kaldırırsanız telefon numaranız da silinir.

### Doğrulama uygulamasını kurmak

**Kur**'a tıklayınca **Doğrulama uygulamasını kurun** ekranı açılır. Yöneticiniz iki adımlı doğrulamayı herkes için zorunlu yaptıysa, girişten sonra bu ekrana doğrudan yönlendirilirsiniz.

1. Telefonunuzda Google Authenticator, Microsoft Authenticator, Authy veya benzeri bir uygulama açın.
2. Ekrandaki QR kodunu uygulamayla tarayın. Tarayamıyorsanız **Tarayamıyor musunuz? Anahtarı elle girin**'e tıklayın ve gösterilen anahtarı uygulamaya yazın.
3. Uygulamanın gösterdiği kodu **Uygulamadaki 6 haneli kod** alanına girin ve **Etkinleştir**'e tıklayın.
4. **Kurtarma kodlarınız** ekranı açılır. Bu kodlar **bir daha gösterilmez**. **Kopyala** veya **İndir (.txt)** ile güvenli bir yere kaydedin, **Kodları güvenli bir yere kaydettim** kutusunu işaretleyin ve **Tamam**'a tıklayın.

Telefonunuza erişemediğinizde girişte bu kodlardan birini kullanabilirsiniz. Her kod bir kez kullanılır. Kurulumu şimdi yapamıyorsanız ekrandaki **Çıkış yap** ile çıkabilirsiniz.

## Oturumlar

Hesabınızın açık olduğu tarayıcılar listelenir: **Tarayıcı**, **Adres**, **Başladı** ve **Son etkinlik**. Şu an kullandığınız tarayıcının yanında **(bu tarayıcı)** yazar.

- **Sonlandır**: o oturumu kapatır. Tanımadığınız bir oturum görürseniz kapatın ve parolanızı değiştirin.
- **Tüm cihazlardan çıkış yap**: bu tarayıcı dahil tüm oturumlarınızı kapatır ve hatırlanan cihazları unutur. Onay istenir.

## Hatırlanan cihazlar

Girişte **Bu cihazı … gün hatırla** kutusunu işaretlediğiniz cihazlar burada, ne zamana kadar hatırlanacaklarıyla birlikte listelenir. Bu cihazlardan girişte doğrulama kodu sorulmaz. **Unut** ile bir cihazı listeden çıkarırsınız; o cihazdan bir sonraki girişte yeniden kod sorulur. Hiç cihaz yoksa **Hatırlanan cihaz yok.** yazar.

## Sık sorulanlar

**Parolamı unuttum.**
Uygulamada parola sıfırlama bağlantısı yoktur. Yöneticinizden parolanızı sıfırlamasını isteyin. Bkz. [Giriş ve İlk Yönetici](/rehber/sign-in).

**Telefonumu değiştirdim. Doğrulama uygulamasını nasıl taşırım?**
Eski telefonunuz hâlâ elinizdeyse: **Kaldır** ile doğrulama uygulamasını kaldırın, sonra **Kur** ile yeni telefonda baştan kurun. Eski telefon elinizde değilse girişte bir kurtarma kodu kullanın ya da yöneticinizden **2 adımlıyı sıfırla** istemesini isteyin.

**Kurtarma kodlarımı kaybettim.**
Giriş yapabiliyorsanız **Yeniden oluştur**'a tıklayın. Yeni kodlar verilir ve eskiler geçersiz olur.

**Bir oturum hiç tanımadığım bir adresten görünüyor.**
**Sonlandır**'a tıklayın, ardından parolanızı değiştirin ve yöneticinize haber verin.

<!-- kaynak: doc 18 §3.2, §5, doc 06 §10.3, §10.5; apps/web/src/app/account/page.tsx, account/account-client.tsx, account/mfa-section.tsx, account/password/password-client.tsx, account/mfa-setup/mfa-setup-client.tsx, components/recovery-codes.tsx, app/nav-shell.tsx -->
