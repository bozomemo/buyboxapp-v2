---
id: settings-product-sources
title: Ürün Kaynakları
section: screens
order: 45
module: seller
routes:
  - /settings/product-sources
---

**Ürün Kaynakları** sekmesi, stok kodlarınızın, ürün adlarının, birim maliyetlerin ve stok miktarlarının uygulamaya nereden geleceğini belirler. Maliyet doğru gelmezse taban fiyat da doğru hesaplanamaz; bu yüzden bu ayarı kurulumda bir kez yapıp, kaynağınız değiştiğinde yeniden açarsınız.

Sayfanın üstünde **Şu anda yapılandırılmış bir kaynak var.** veya **Henüz bir ürün kaynağı yapılandırılmadı.** yazar.

## Ürün Kaynağı

**Ürün Kaynağı** listesinden birini seçin:

- **Manuel (Stok ekranından tek tek eklenir)**: ürünleri ve maliyetleri [Stok](/rehber/stock) ekranından kendiniz girersiniz.
- **Excel**: ürünler bir Excel dosyasından okunur.
- **Pazaryeri listelerinden**: ürünler pazaryerindeki ilanlarınızdan alınır. Bu kaynak ilanlar içe aktarıldıktan sonra devreye girer; önizlenecek veri yoktur. Birim maliyeti ayrıca girmeniz gerekir.

## Excel kaynağını kurmak

1. **Excel** seçeneğini seçin.
2. Dosya seçme alanından **.xlsx** dosyanızı seçin.
3. Dört sütun başlığı alanını dosyanızdaki başlıklarla aynı yazın:
   - **baseStockCode sütun başlığı**: stok kodunun bulunduğu sütun (varsayılan: KODU).
   - **name sütun başlığı**: ürün adının bulunduğu sütun (varsayılan: ADI).
   - **unitCost sütun başlığı**: birim maliyetin bulunduğu sütun (varsayılan: Standart_Maliyet).
   - **unitStock sütun başlığı**: stok miktarının bulunduğu sütun (varsayılan: TOPLAM MIKTAR).
4. **İlk 20 Satırı Önizle**'ye tıklayın. Dosyanın ilk 20 satırı **Stok Kodu**, **Ad**, **Birim Fiyat** ve **Stok** sütunlarıyla gösterilir. **Birim Fiyat** sütununda maliyetler görünür; doğru sütunun okunduğunu buradan kontrol edin.
5. Önizleme doğruysa **Kaydet**'e tıklayın. **Ürün kaynağı yapılandırması kaydedildi.** mesajı görünür.

Excel kaynağında önizleme başarılı olmadan **Kaydet** düğmesi açılmaz. Maliyetleri faturadaki gibi, KDV dahil tutun; uygulama KDV eklemez veya ayırmaz.

## ERP Entegrasyonu

Bu kartta şu an yapılabilecek bir ayar yoktur.

## Kim değiştirebilir?

Önizleme ve kaydetme yalnızca Yönetici rolüne açıktır. Diğer roller mevcut ayarı görebilir.

## Sık sorulanlar

**Önizleme "başarısız" diyor.**
Sütun başlıklarının dosyadakiyle harfi harfine aynı olduğunu kontrol edin (boşluklar dahil). Dosyanın .xlsx biçiminde olduğundan emin olun.

**Excel dosyamı değiştirdim, yeniden yüklemem gerekir mi?**
Dosyanın kendisi saklanmaz, yalnızca sütun eşlemesi saklanır. Yeni ürünleri ve maliyetleri içe aktarmak için [Stok](/rehber/stock) ekranını kullanın.

**Kaynağı değiştirirsem eski ürünler silinir mi?**
Bu ekran yalnızca ürünlerin nereden okunacağını belirler; kaydetmek ürün silmez.

<!-- kaynak: doc 06 §9, doc 02 §0, §4; apps/web/src/app/settings/product-sources/page.tsx, settings/product-sources/product-sources-client.tsx, app/setup/steps/step6-product-source.tsx, app/api/setup/product-source/save/route.ts, app/api/setup/product-source/test/route.ts -->
