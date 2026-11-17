---
id: faq
title: Sık Sorulan Sorular
section: faq
order: 1
module: null
routes: []
---

Ekranlara özgü sorular her ekranın kendi bölümünün sonunda da yer alır. Aradığınızı bulamazsanız sayfanın üstündeki arama kutusunu kullanın ya da [Sorun Giderme](/rehber/troubleshooting) bölümüne bakın.

## Genel

**Uygulama ne yapar?**
Satış modülü, Trendyol ve Hepsiburada'daki ilanlarınızın fiyatını buybox'ı kazanacak ve kâr bırakacak şekilde otomatik ayarlar. Marka modülü, bir markanın ürünlerinin pazardaki fiyatlarını izler ve belirlenen bandın dışına çıkanları bildirir. Bkz. [Kurulumdan Sonra İlk Adımlar](/rehber/start).

**Yeni kurdum ama hiçbir şey olmuyor.**
Yeni kurulum güvenlik için duraklatılmış başlar. Sağ üstteki **Genel Durdurma: Duraklatıldı** düğmesine tıklayarak sistemi başlatın. Bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop).

**Bir şeyler ters gidiyor, her şeyi nasıl durdururum?**
Her ekranın sağ üstündeki **Sistem Çalışıyor** düğmesine tıklayın. Tüm işler durur; pazaryerindeki fiyatlar olduğu gibi kalır.

**Her ekranın sağ üstündeki ? işareti ne?**
Bulunduğunuz ekranın rehber bölümünü açar.

**Bu rehberde bazı bölümler yok.**
Rehber yalnızca kurulumunuzda açık olan modüllerin bölümlerini gösterir.

## Fiyatlar (satış modülü)

**Uygulama zararına satış yapar mı?**
Hayır. Fiyat hiçbir zaman [taban fiyatın](/rehber/concepts-floor-price) altına indirilmez. Taban fiyatın altındaki bir ilan ilk fırsatta taban fiyata yükseltilir.

**Fiyatım neden değişmiyor?**
İlanın son karar açıklamasına bakın. En sık nedenler: ilan zaten en iyi fiyatta, rakip taban fiyatınızın altında, ilanın otomasyonu kapalı ya da fiyat gönderimi kapalı. Bkz. [Fiyatım değişmiyor](/rehber/troubleshooting#fiyatim-degismiyor).

**Rakip benden ucuz, neden ona göre inmiyor?**
Rakibin fiyatı sizin taban fiyatınızın altındaysa inmek zarar etmek demektir; uygulama bunu yapmaz.

**Fiyatlar neden sürekli değişmiyor da bir noktada duruyor?**
En kârlı fiyat bulunduğunda (**Optimum**) uygulama gereksiz güncelleme yapmaz; pazaryerleri günlük güncelleme sayısını sınırlar. Bkz. [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing).

**Maliyeti KDV dahil mi girmeliyim?**
Evet. Tüm tutarlar (maliyet, kargo, giderler) KDV dahil girilir. Uygulama hiçbir hesapta ayrıca KDV kullanmaz. Bkz. [Maliyet, Komisyon ve Kargo](/rehber/concepts-cost-and-fees).

**Bir ilanın fiyatını elle nasıl değiştiririm?**
**İlanlar** ekranında veya ilan ayrıntısında fiyatı değiştirin. Uygulama sizin fiyatınızı hemen ezmemek için o ilanın otomasyonunu kısa bir süre duraklatır. Bkz. [İlanlar](/rehber/listings).

**Bir ilan için fiyatın belli bir aralıkta kalmasını istiyorum.**
İlanın **Min/Max** değerlerini girin. Otomasyon bu sınırların dışına çıkmaz.

**Bir ilanı otomasyondan çıkarmak istiyorum.**
**İlanlar** ekranında ilanı seçip **Otomasyonu Kapat / Hariç Tut**'a tıklayın.

**Fiyatları önce görüp sonra mı göndersem?**
Evet, ilk kurulumda öneririz. **Panel → Güvenlik Anahtarları**'nda fiyat gönderimini kapalı tutun; uygulama fiyatları hesaplar ama göndermez.

## Rakip verisi

**Rakip verisi fiyatlarımı etkiler mi?**
Hayır. Rakip verisi yalnızca raporlama içindir; fiyat kararları pazaryerinin verdiği buybox bilgisine dayanır. Bkz. [Rakip Verisi](/rehber/concepts-competitor-data).

**Rakip verisi neden eksik ya da gecikmeli?**
Toplama sınırlı bir hızla yapılır ve pazaryeri sayfaları bazen geçici olarak erişilemez. Uygulama sonraki turda yeniden dener.

## Marka modülü

**Fiyat bandı ihlali ne demek?**
Buybox'taki fiyatın, ürün için belirlediğiniz en düşük fiyatın altına ya da en yüksek fiyatın üstüne çıkması. Bkz. [Marka Alarmları](/rehber/brand-alerts).

**Alarm geldiğinde bana bildirim gelir mi?**
**Ayarlar → Bildirimler** ekranında e-posta veya SMS kanalı hazırsa ve alıcı girildiyse evet. Bkz. [Bildirimler](/rehber/settings-notifications).

**Ürünlerimi toplu nasıl eklerim?**
**Marka Denetimi → Stok** ekranından Excel ile içe aktarın. Bkz. [Marka Stok](/rehber/brand-products).

## Kullanıcılar ve giriş

**Parolamı unuttum.**
Yöneticinize başvurun; **Ayarlar → Kullanıcılar** ekranından size geçici bir parola verir. Bkz. [Giriş ve İlk Yönetici](/rehber/sign-in#kullanici-parolasini-unuttu).

**Telefonumu kaybettim, doğrulama kodu alamıyorum.**
Kurtarma kodlarınızdan biriyle girin. Yoksa yöneticiniz iki adımlı doğrulamanızı sıfırlar. Bkz. [Giriş ve İlk Yönetici](/rehber/sign-in#kullanici-telefonunu-kaybetti-dogrulama-kodu-yok).

**Bir düğme gri, tıklayamıyorum.**
Rolünüz o işleme izin vermiyor. Bkz. [Roller ve Yetkiler](/rehber/concepts-roles).

**Yeni çalışan nasıl eklerim?**
**Ayarlar → Kullanıcılar → Yeni kullanıcı**. Bkz. [Kullanıcılar](/rehber/users).

## Lisans ve güncelleme

**Lisansımın süresi doldu, ne olur?**
7 gün boyunca uygulama normal çalışır ve üstte bir uyarı görünür. Bu sürede yeni anahtarı **Lisans** ekranına girin; süre biterse işler durur. Bkz. [Lisans](/rehber/license).

**Güncelleme nasıl yapılır?**
Yeni sürüm hazır olduğunda üst çubukta bildirim görünür. Bkz. [Güncelleme](/rehber/settings-update).

<!-- kaynak: tüm rehber konuları; doc 02, doc 03, doc 13, doc 17, doc 18 -->
