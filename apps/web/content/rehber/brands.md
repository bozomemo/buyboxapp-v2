---
id: brands
title: Markalar
section: screens
order: 12
module: seller
routes:
  - /brands
---

Markalar ekranı, ilanlarınızın hangi markalara ait olduğunu ve her markada kaç ilanınız olduğunu gösterir. Bir markanın tüm ilanlarına hızlıca ulaşmak istediğinizde bu ekranı açın: markanın adına tıkladığınızda [İlanlar](/rehber/listings) ekranı o markaya filtrelenmiş olarak açılır.

Marka bilgisi bugün yalnızca Trendyol ilanları için doludur. Hepsiburada ilan bilgisiyle birlikte marka gelmediği için Hepsiburada ilanları bu listede görünmez.

## Ekranın üstü

- **Marka ara…**: Yazdığınız metni marka adlarında arar. Eşleşen yoksa **Aramayla eşleşen marka yok.** yazar.
- **Excel'e Aktar**: Tüm marka listesini (marka, pazaryeri ve ürün sayısı) dosya olarak indirir. Arama kutusu dosyayı etkilemez.

## Marka tablosu

- **Marka**: Markanın adı. Tıklayınca İlanlar ekranı bu markanın ilanlarıyla açılır. İlanlar ekranındaki **Marka** filtresi de bu markayı seçili gösterir; oradan değiştirebilir veya **Temizle** ile kaldırabilirsiniz.
- **Pazaryeri**: Markanın hangi pazaryerinde görüldüğü.
- **Ürün**: Bu markadaki ilan sayınız.

Liste, ilan sayısı en çok olan markadan başlar. Tablonun altında sayfa geçişi vardır.

Hiç marka yoksa **Henüz marka bilgisi yok.** yazar. Trendyol ilanları içe aktarıldıktan sonra liste dolar.

Bu ekran yalnızca görüntüleme içindir; her rol kullanabilir.

## Sık sorulanlar

**Hepsiburada markalarım neden listede yok?**
Hepsiburada, ilan bilgileriyle birlikte marka bilgisi vermez. Bu yüzden liste bugün yalnızca Trendyol ilanlarından oluşur.

**Bir markaya tıkladım, İlanlar ekranında başka filtreler de seçiliydi. Neden?**
Markaya tıklamak yalnızca marka filtresini ayarlar. İlanlar ekranında daha önce bıraktığınız bir filtre varsa **Temizle** ile kaldırın.

**Liste ne zaman güncellenir?**
Trendyol ilanlarınız her içe aktarıldığında marka listesi ve ilan sayıları da güncellenir.

**Bu ekran marka denetimi modülündeki markalarla aynı mı?**
Hayır. Bu ekran yalnızca sizin ilanlarınızın markalarını gösterir. Başkalarının sizin markanızı nasıl sattığını izlemek için [İzlenen Markalar](/rehber/watched-brands) ekranı kullanılır.

<!-- kaynak: doc 06 §12.1, §4.5; apps/web/src/app/brands/brands-client.tsx, apps/web/src/app/listings/listings-client.tsx, apps/web/src/app/api/brands/route.ts -->
