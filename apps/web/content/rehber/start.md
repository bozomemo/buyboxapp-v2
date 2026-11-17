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

## 5. Modülünüzün ilk adımları

Şimdi kullandığınız modülün adımlarına geçin:

- Satış modülü: [İlk Adımlar: Satış Modülü](/rehber/start-seller) — maliyetler, ücretler ve otomasyonu güvenle açmak.
- Marka modülü: [İlk Adımlar: Marka Modülü](/rehber/start-brand) — ürünler, bantlar ve izleme.

## 6. Günlük kullanım

- Güne **Panel** ile başlayın: **Dikkat Gerekenler** bölümünde bir şey varsa önce onu çözün.
- Kırmızı veya sarı uyarılar için [Sorun Giderme](/rehber/troubleshooting) bölümüne bakın.
- Her ekranın sağ üstündeki **?** işareti, o ekranın rehber bölümünü açar.

## Kontrol listesi

- [ ] İlk yönetici oluşturuldu, iki adımlı doğrulama kuruldu, kurtarma kodları saklandı.
- [ ] Lisans etkin.
- [ ] Kurulum Sihirbazı tamamlandı.
- [ ] En az iki yönetici var; diğer kullanıcılar doğru rollerle eklendi.

<!-- kaynak: doc 18 §8.1, §6.2; doc 13; doc 17 §1, §2, §5, §6; doc 02 §0, §4; doc 03 §3, §5; doc 06 §2, §3; apps/web/src/app/setup/wizard-types.ts, stock/stock-client.tsx, listings/listings-client.tsx, dashboard-client.tsx, nav-shell.tsx -->
