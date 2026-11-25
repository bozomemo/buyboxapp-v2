---
id: brand-comparison
title: Marka Karşılaştırması
section: screens
order: 30
module: brand
routes:
  - /watched-brands/comparison
---

**Marka Denetimi → Marka Karşılaştırması** ekranı, izlediğiniz markaların dönem içindeki ortalama piyasa fiyatını yan yana gösterir. Kendi markanızın fiyat seviyesinin rakip bir markaya göre nerede durduğunu ve bu farkın zamanla açılıp açılmadığını görmek için açın. Ekran yalnızca raporlama içindir.

Bir markayı karşılaştırmada rakip olarak kullanmak için önce [İzlenen Markalar](/rehber/watched-brands) ekranında **Tür** sütununu **rakip** yapın. Rakip markalar aynı şekilde taranır ama denetim bulgusu üretmez.

## Dönem ve marka seçimi

- **Dönem**: **Son 7 gün**, **Son 30 gün** ya da **Son 90 gün**.
- Marka düğmeleri: her izlenen marka, yanında **bizim** ya da **rakip** yazan bir düğmedir. Hiçbirini seçmezseniz tüm markalar gösterilir. Bir düğmeye tıklayınca yalnızca seçtiğiniz markalar gösterilir; seçili düğmede ✓ işareti görünür. **Tümü** seçimi temizler.

## Fiyat endeksi

En az bir **rakip** marka varsa **… tabanına göre fiyat endeksi** kutusu çıkar. Taban, listedeki ilk rakip markadır. Her **bizim** markanız için bir sayı gösterilir:

- **100**: ortalama fiyatınız tabanla aynı.
- **112**: ortalama fiyatınız tabanın %12 üstünde (altında **%12,0 üstünde** yazar).
- **90**: ortalama fiyatınız tabanın %10 altında.

**Bu birebir ürün karşılaştırması değildir.** İki markanın gramajları ve ürün çeşitleri farklıdır. Üst segment ürünü çok olan bir marka, her benzer üründe daha ucuz olsa bile endekste yüksek çıkabilir. Anlamlı olan endeksin seviyesi değil, zaman içindeki **hareketidir**: fark açılıyor mu, kapanıyor mu?

Hiç rakip marka izlenmiyorsa endeks hesaplanmaz ve bunu söyleyen bir not görünür.

## Ortalama piyasa fiyatı grafiği

Grafik, seçili markaların günlük ortalama piyasa fiyatını ayrı renklerde çizer. Bir noktanın üzerine gelince o günün değerleri görünür. Grafik için en az iki günlük veri gerekir.

## Dönem özeti

Her marka için bir satır:

- **Marka**: tıklayınca [Takip Edilen Ürünler](/rehber/tracked-products) o markaya filtrelenmiş olarak açılır.
- **Tür**: **bizim** ya da **rakip**.
- **Ort. fiyat (tüm ürünler)**: dönemdeki ortalama teklif fiyatı. Markanın bütün ürünleri birlikte ortalanır; 2 kg ile 12 kg aynı ortalamaya girer. Bu yüzden iki markanın sayısını doğrudan değil, zaman içindeki değişimini karşılaştırın.
- **Endeks**: bizim markalar için tabana göre endeks; diğerlerinde **—**.
- **Veri günü**: ortalamanın kaç günlük veriye dayandığı. İki günlük veriden çıkan bir endeks, otuz günlük olanla aynı güvenilirlikte değildir.
- **Son gün**: en son verinin günü, tarih olarak (örneğin 25.11.2026). Günler UTC'ye göre ayrılır; gece 00:00 ile 03:00 arasında toplanan veri bir önceki güne sayılır.

**Excel'e Aktar** tabloyu indirir.

Bu dönemde hiçbir marka için veri yoksa tabloda bunu söyleyen bir satır görünür; daha geniş bir dönem seçin.

## Sık sorulanlar

**Endeks kutusu görünmüyor.**
Hiç **rakip** marka izlenmiyor ya da rakip markanın bu dönemde fiyat verisi yok. [İzlenen Markalar](/rehber/watched-brands) ekranında rakip markayı ekleyip **Tür**'ünü **rakip** yapın ve taranmasını bekleyin.

**Endeksimiz 115, ürünlerimiz rakipten pahalı mı?**
Tek başına bunu söylemez. Ürün çeşitleri farklıdır. Endeksin haftalar içinde yükselip yükselmediğine bakın.

**Rakip markayı izlemeye almak denetim bulgusu üretir mi?**
Hayır. **rakip** markalar için denetim bulgusu üretilmez; yalnızca fiyatları izlenir.

<!-- kaynak: doc 06 §12.4 (2026-09-03 extension); apps/web/src/app/watched-brands/comparison/brand-comparison-client.tsx; api/brand-reports/comparison/route.ts (index baseline) -->
