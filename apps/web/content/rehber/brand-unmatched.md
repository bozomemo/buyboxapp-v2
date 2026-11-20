---
id: brand-unmatched
title: Eşleşmemiş Kartlar
section: screens
order: 25
module: brand
routes:
  - /brand/unmatched
---

**Marka Denetimi → Eşleşmemiş Kartlar** ekranı, markalarınızın pazaryeri taramasında bulunan ama hiçbir stok ürününüze bağlı olmayan kartları listeler. Bağlı olmayan bir kartın fiyat aralığı yoktur; bu yüzden o kartta kimin kaça sattığı için alarm da çıkmaz. Bu ekran "bu kart kimin?" sorusunun iş listesidir.

Yalnızca **kendi markanız** olarak işaretli markaların kartları burada görünür. Rakip markaların kartları ve link yapıştırarak eklediğiniz kartlar listelenmez.

## Kuyruk

Tablonun üstünde toplam kart sayısı ve son 7 günde bulunan yeni kart sayısı yazar. Kartlar değerlendirme sayısına göre sıralanır: en çok değerlendirilen, yani büyük olasılıkla en çok satan kart önce gelir.

- **Kart**: kartın adı, **↗** ile pazaryerindeki sayfa ve pazaryeri. Barkodu biliniyorsa altında yazar.
- **Marka**: kartı bulan izlenen marka.
- **Değerlendirme**: kartın değerlendirme sayısı.
- **Satıcı**: son başarılı bakışta kartı satan var mı: **satılıyor**, **satan yok** ya da **bakılmadı**.
- **İlk görülme**: kartın ilk bulunduğu zaman. Son 7 gün içindeyse yanında **yeni** yazar.
- **Öneri**: kartın barkodu bir stok ürününüzün barkoduyla aynıysa o ürün önerilir. Adet çarpanını yazıp **Bağla**'ya basınca kart ürüne bağlanır ve fiyat aralığıyla izlenmeye başlar. Barkod eşleşmesi yoksa kartı [Marka Stok](/rehber/brand-products) ekranında ilgili ürüne bağlayabilirsiniz.

Sistem kartı ürüne adına bakarak kendiliğinden bağlamaz. Barkod da yalnızca bir öneridir: barkod, iki sayfanın aynı ürünü anlattığını söyler ama pakette kaç adet olduğunu söylemez. Çarpanı siz yazarsınız.

## İşlemler

- **☆ İlanlara ekle**: kartı bağlamadan [Marka İlanları](/rehber/brand-listings) ekranına ekler. Kart orada izlenir ama fiyat aralığı olmadığı için alarm üretmez.
- **Bizim değil**: kartı kuyruktan çıkarır. Örneğin markanızın adını taşıyan başka bir ürün ya da sizin için önemsiz bir kart. Çıkardığınız kart sonraki taramalarda kuyruğa geri gelmez.

Bu işlemler Yönetici ve Fiyat Yöneticisi rollerine açıktır. İzleyici rolü tabloyu görür ama düğmeler pasiftir.

## Kenara alınanlar

**Kenara alınanlar** düğmesi **Bizim değil** dediğiniz kartları gösterir. **Kuyruğa geri al** kartı tekrar kuyruğa koyar. **Kuyruğa dön** ana listeye döner.

## Sık sorulanlar

**Kuyrukta çok fazla kart var. Nereden başlamalıyım?**
Listenin başından. Kartlar çok satandan aza doğru sıralıdır; ilk sayfalardaki kartları bağlamak en çok satışı kapsar.

**Bağladığım kart neden listeden çıktı?**
Kuyruk yalnızca hiçbir ürüne bağlı olmayan kartları gösterir. Bağlanan kart artık [Marka İlanları](/rehber/brand-listings) ekranında izlenir.

**Rakip markanın kartları neden görünmüyor?**
Rakip markalar karşılaştırma için izlenir; onların kartları sizin ürününüz değildir. Markanın kendi markanız mı rakip mi olduğu [İzlenen Markalar](/rehber/watched-brands) ekranında ayarlanır.

<!-- kaynak: brand roadmap §6.9; apps/web/src/app/brand/unmatched/unmatched-client.tsx; api/brand/unmatched permission -->
