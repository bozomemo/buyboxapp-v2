---
id: start
title: Kurulumdan Sonra İlk Adımlar
section: start
order: 1
module: null
routes: []
---

Bu bölüm, uygulama firmanıza kurulduktan sonra ilk günden düzenli kullanıma kadar yapmanız gerekenleri sırayla anlatır. Adımları atlamadan izleyin. Özellikle otomasyonu açmadan önceki kontroller, yanlış fiyatla satış yapmamanız için önemlidir.

Uygulama iki modülden oluşur:

- **Satış modülü:** Kendi mağazanızın Trendyol ve Hepsiburada ilanlarının fiyatını, buybox'ı kazanacak ve yine de kâr bırakacak şekilde otomatik ayarlar.
- **Marka modülü:** Bir markanın ürünlerini pazaryerlerinde izler; fiyatın belirlediğiniz bandın dışına çıktığı ilanları alarm olarak gösterir.

Kurulumunuzda hangisinin açık olduğuna göre bazı adımlar görünmez. Bu rehber de yalnızca açık modüllerin bölümlerini gösterir.

## 1. İlk yönetici ve giriş

Kurulumdan sonra uygulamayı ilk açtığınızda **İlk yönetici** ekranı gelir. Kurulumu yapan kişiden **Kurulum anahtarı**nı alın ve ilk yönetici hesabını oluşturun. Ayrıntılar: [Giriş ve İlk Yönetici](/rehber/sign-in#ilk-yonetici-kurulumdan-hemen-sonra).

Ardından giriş yapın. İki adımlı doğrulama açıksa telefonunuza bir doğrulama uygulaması kurmanız istenir. Gösterilen **kurtarma kodları**nı güvenli bir yere kaydedin; telefonunuzu kaybederseniz bunlarla girersiniz.

## 2. Lisans

Kurulum henüz lisanslanmadıysa **Lisans** ekranı açılır ve lisans anahtarınızı yapıştırmanız istenir. Anahtarı tedarikçinizden alın, tamamını boşluksuz yapıştırın. Ayrıntılar: [Lisans](/rehber/license).

## 3. Kurulum Sihirbazı

Kurulum tamamlanmadıysa uygulama sizi kendiliğinden **Kurulum Sihirbazı**'na götürür. Sihirbaz temel ayarları adım adım yaptırır. Adımlar:

1. **Veritabanı** — genellikle kurulumu yapan kişi tamamlamıştır.
2. **Kullanım Amacı** — hangi modülleri kullanacağınızı seçersiniz.
3. **Mağaza Kimliği** — mağazanızın pazaryerindeki kimliği.
4. **Pazaryerleri** — Trendyol ve Hepsiburada bağlantı bilgileri.
5. **Ücret Ayarları** — komisyon, kargo ve diğer sabit giderler.
6. **Fiyatlandırma Politikası** — otomasyonun nasıl davranacağı.
7. **Ürün Kaynağı** — stok ve maliyet bilgisinin nereden geleceği.
8. **ERP Bağlantısı** — kullanıyorsanız ERP sisteminizle bağlantı.
9. **Gözden Geçir ve Bitir**.

Yalnızca marka modülünü kullanıyorsanız 3, 5, 6, 7 ve 8. adımlar gösterilmez. Sihirbazı yarıda bırakabilirsiniz; kaldığınız adımı hatırlar. Ayrıntılar: [Kurulum Sihirbazı](/rehber/setup).

Sihirbaz bu ekranlardaki ayarları sizin yerinize doldurur; daha sonra her birini **Ayarlar** altından tek tek değiştirebilirsiniz.

## 4. Kullanıcıları ekleyin

**Ayarlar → Kullanıcılar** ekranından çalışma arkadaşlarınızı ekleyin ve her birine uygun rolü verin:

- **Yönetici** — her şey, ayarlar ve kullanıcılar dahil.
- **Fiyat Yöneticisi** — fiyat, stok, katalog ve işler; ayarlar ve kullanıcılar hariç.
- **İzleyici** — yalnızca görüntüler; hiçbir şeyi değiştiremez, otomasyonu durduramaz.

En az **iki yönetici** hesabı tutmanızı öneririz: biri giriş yapamazsa diğeri onun parolasını sıfırlayabilir. Ayrıntılar: [Roller ve Yetkiler](/rehber/concepts-roles), [Kullanıcılar](/rehber/users).

## 5. Satış modülü: maliyetler ve stok

Fiyat motoru her ilanın **taban fiyatını** maliyetinizden hesaplar. Maliyet yanlışsa taban fiyat da yanlış olur; bu yüzden otomasyondan önce en önemli adım budur.

1. **Stok** ekranında **İçe Aktar** ile ürün kaynağınızdan stok kalemlerini alın ya da elle ekleyin.
2. Her kalemin **Birim Fiyat (₺, KDV dahil)** alanını, yani birim maliyetini kontrol edin. Maliyet **KDV dahil**, gerçekte ödediğiniz tutar olarak girilmelidir. KDV hariç bir maliyet girerseniz taban fiyat olması gerekenden düşük çıkar.
3. Maliyeti bilinmeyen ya da 0 olan kalemler kırmızı görünür ve otomatik fiyatlamaya hiç girmez. Bunları tamamlayın.
4. Birden fazla ürünü birlikte satıyorsanız (set, koli) bunları **paket** olarak tanımlayın.

Ayrıntılar: [Stok](/rehber/stock), [Taban Fiyat](/rehber/concepts-floor-price), [Maliyet, Komisyon ve Kargo](/rehber/concepts-cost-and-fees).

## 6. Satış modülü: ücretler ve politika

- **Ayarlar → Ücretler**: Her pazaryeri için kargo ve diğer sabit giderleri gerçekte ödediğiniz tutarlarla girin. Bu tutarlar taban fiyatı doğrudan etkiler. Ayrıntılar: [Ücretler](/rehber/settings-fees).
- **Ayarlar → Politika**: Otomasyonun adım büyüklüğünü, tek satıcıyken hedeflenen kâr oranını ve stok kuralını belirleyin. Ayrıntılar: [Fiyat Politikası](/rehber/settings-policy).

## 7. Satış modülü: otomasyonu güvenle açmak

Yeni kurulum güvenlik için **duraklatılmış** başlar: hiçbir iş çalışmaz ve fiyat gönderimi kapalıdır. Fiyatlar pazaryerine yalnızca **Fiyat gönderimi** açıkken gider. Önerdiğimiz sıra:

1. Sağ üstteki **Genel Durdurma: Duraklatıldı** düğmesine tıklayarak sistemi başlatın. **Panel**'deki **Güvenlik Anahtarları** bölümünde fiyat gönderimini şimdilik kapalı tutun. Uygulama bu durumda ilanları içe aktarır ve fiyatları hesaplar ama göndermez.
2. Birkaç saat bekleyin; **İlanlar** ekranında hesaplanan fiyatları, faz ve karar açıklamalarını inceleyin. Bir ilanın hesaplanan fiyatı size mantıksız geliyorsa önce o ürünün maliyetini ve ücret ayarlarını kontrol edin.
3. Gerekirse belirli ilanlara en düşük / en yüksek fiyat sınırı koyun (**İlanlar** ekranındaki **Min/Max** sütunu). Bu sınırlar otomasyonun asla geçemeyeceği sınırlardır.
4. Otomasyonu önce küçük bir ilan grubunda açın (**İlanlar** ekranında seçip **Otomasyonu Aç**).
5. Sonuçlardan memnunsanız fiyat gönderimini açın ve otomasyonu kalan ilanlara yayın.

Bir sorun görürseniz her ekranın üst çubuğundaki sistem düğmesiyle tüm işleri tek tıkla durdurabilirsiniz. Ayrıntılar: [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop), [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing), [İlanlar](/rehber/listings).

## 8. Marka modülü: ürünler ve izleme

1. **Marka Denetimi → Stok** ekranında markanızın ürünlerini, satış fiyatı ve izin verilen en düşük / en yüksek fiyatla ekleyin ya da Excel'den içe aktarın. Ayrıntılar: [Marka Stok](/rehber/brand-products).
2. Ürünleri pazaryerindeki ürün kartlarına bağlayın.
3. Sistem henüz duraklatılmışsa sağ üstteki **Genel Durdurma: Duraklatıldı** düğmesine tıklayarak başlatın; aksi halde tarama yapılmaz.
4. **İzlenen Markalar** ekranında izlenecek markaları ekleyin. Ayrıntılar: [İzlenen Markalar](/rehber/watched-brands).
5. Fiyat bandını ihlal eden ilanlar **Alarmlar** ekranında görünür. Bildirim almak istiyorsanız **Ayarlar → Bildirimler** ekranından e-posta veya SMS alıcılarını girin. Ayrıntılar: [Marka Alarmları](/rehber/brand-alerts), [Bildirimler](/rehber/settings-notifications).

## 9. Günlük kullanım

- Güne **Panel** ile başlayın: **Dikkat Gerekenler** bölümünde bir şey varsa önce onu çözün.
- Kırmızı veya sarı uyarılar için [Sorun Giderme](/rehber/troubleshooting) bölümüne bakın.
- Her ekranın sağ üstündeki **?** işareti, o ekranın rehber bölümünü açar.

## Kontrol listesi

- [ ] İlk yönetici oluşturuldu, iki adımlı doğrulama kuruldu, kurtarma kodları saklandı.
- [ ] Lisans etkin.
- [ ] Kurulum Sihirbazı tamamlandı.
- [ ] En az iki yönetici var; diğer kullanıcılar doğru rollerle eklendi.
- [ ] (Satış) Tüm stok kalemlerinin maliyeti KDV dahil ve doğru; kırmızı satır kalmadı.
- [ ] (Satış) Ücretler ve fiyat politikası girildi.
- [ ] (Satış) Fiyatlar gönderim kapalıyken incelendi; otomasyon önce küçük bir grupta açıldı.
- [ ] (Marka) Ürünler, bantları ve kart bağlantıları girildi; izlenen markalar eklendi.
- [ ] (Marka) Bildirim alıcıları girildi.

<!-- kaynak: doc 18 §8.1, §6.2; doc 13; doc 17 §1, §2, §5, §6; doc 02 §0, §4; doc 03 §3, §5; doc 06 §2, §3; apps/web/src/app/setup/wizard-types.ts, stock/stock-client.tsx, listings/listings-client.tsx, dashboard-client.tsx, nav-shell.tsx -->
