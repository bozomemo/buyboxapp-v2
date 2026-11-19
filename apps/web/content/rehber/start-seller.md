---
id: start-seller
title: İlk Adımlar: Satış Modülü
section: start
order: 2
module: seller
routes: []
---

Genel ilk adımları ([Kurulumdan Sonra İlk Adımlar](/rehber/start)) tamamladıktan sonra satış modülü için bu adımları sırayla izleyin. Otomasyonu açmadan önceki kontroller, yanlış fiyatla satış yapmamanız için önemlidir.

## 1. Maliyetler ve stok

Fiyat motoru her ilanın **taban fiyatını** maliyetinizden hesaplar. Maliyet yanlışsa taban fiyat da yanlış olur; bu yüzden otomasyondan önce en önemli adım budur.

1. **Stok** ekranında **İçe Aktar** ile ürün kaynağınızdan stok kalemlerini alın ya da elle ekleyin.
2. Her kalemin **Birim Fiyat (₺, KDV dahil)** alanını, yani birim maliyetini kontrol edin. Maliyet **KDV dahil**, gerçekte ödediğiniz tutar olarak girilmelidir. KDV hariç bir maliyet girerseniz taban fiyat olması gerekenden düşük çıkar.
3. Maliyeti bilinmeyen ya da 0 olan kalemler kırmızı görünür ve otomatik fiyatlamaya hiç girmez. Bunları tamamlayın.
4. Birden fazla ürünü birlikte satıyorsanız (set, koli) bunları **paket** olarak tanımlayın.

Ayrıntılar: [Stok](/rehber/stock), [Taban Fiyat](/rehber/concepts-floor-price), [Maliyet, Komisyon ve Kargo](/rehber/concepts-cost-and-fees).

## 2. Ücretler ve politika

- **Ayarlar → Ücretler**: Her pazaryeri için kargo ve diğer sabit giderleri gerçekte ödediğiniz tutarlarla girin. Bu tutarlar taban fiyatı doğrudan etkiler. Ayrıntılar: [Ücretler](/rehber/settings-fees).
- **Ayarlar → Politika**: Otomasyonun adım büyüklüğünü, tek satıcıyken hedeflenen kâr oranını ve stok kuralını belirleyin. Ayrıntılar: [Fiyat Politikası](/rehber/settings-policy).

## 3. Otomasyonu güvenle açmak

Kurulum Sihirbazı bittiğinde sistem çalışmaya başlar, ama **fiyat gönderimi kapalı** başlar: uygulama ilanları içe aktarır ve fiyatları hesaplar, hiçbirini pazaryerine göndermez. Fiyatlar pazaryerine yalnızca **Fiyat gönderimi** açıkken gider. Önerdiğimiz sıra:

1. Sağ üstteki düğmede **Sistem Çalışıyor** yazdığını kontrol edin; **Genel Durdurma: Duraklatıldı** yazıyorsa tıklayarak başlatın. **Panel**'deki **Güvenlik Anahtarları** bölümünde fiyat gönderimini şimdilik kapalı tutun. Uygulama bu durumda ilanları içe aktarır ve fiyatları hesaplar ama göndermez.
2. Birkaç saat bekleyin; **İlanlar** ekranında hesaplanan fiyatları, faz ve karar açıklamalarını inceleyin. Bir ilanın hesaplanan fiyatı size mantıksız geliyorsa önce o ürünün maliyetini ve ücret ayarlarını kontrol edin.
3. Gerekirse belirli ilanlara en düşük / en yüksek fiyat sınırı koyun (**İlanlar** ekranındaki **Min/Max** sütunu). Bu sınırlar otomasyonun asla geçemeyeceği sınırlardır.
4. Otomasyonu önce küçük bir ilan grubunda açın (**İlanlar** ekranında seçip **Otomasyonu Aç**).
5. Sonuçlardan memnunsanız fiyat gönderimini açın ve otomasyonu kalan ilanlara yayın.

Bir sorun görürseniz her ekranın üst çubuğundaki sistem düğmesiyle tüm işleri tek tıkla durdurabilirsiniz. Ayrıntılar: [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop), [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing), [İlanlar](/rehber/listings).

## Kontrol listesi

- [ ] Tüm stok kalemlerinin maliyeti KDV dahil ve doğru; kırmızı satır kalmadı.
- [ ] Ücretler ve fiyat politikası girildi.
- [ ] Fiyatlar gönderim kapalıyken incelendi; otomasyon önce küçük bir grupta açıldı.

<!-- kaynak: moved from start.md; see its sources -->
