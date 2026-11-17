---
id: cross-marketplace
title: Pazaryeri Eşleşmesi
section: screens
order: 29
module: brand
routes:
  - /watched-brands/cross-marketplace
---

**Marka Denetimi → Pazaryeri Eşleşmesi** ekranı, izlediğiniz markaların aynı ürününün Trendyol'daki ve Hepsiburada'daki karşılıklarını yan yana gösterir. Bir ürünün iki pazaryerindeki sayfalarını bulmak ya da hangi ürünlerin yalnızca bir pazaryerinde olduğunu anlamak için açın. Ekran yalnızca raporlama içindir.

## Eşleşme yalnızca barkodla kurulur

İki kart, ancak **aynı barkodu** taşıyorsa eşleşir. Ürün adına, markaya veya gramaja bakan bir tahmin yapılmaz. Bu satırlara göre ihtar yazılabileceği için yanlış bir eşleşme, eksik bir eşleşmeden kötüdür.

Bu yüzden barkodu bilinmeyen ürünler eşleşmede görünmez; kaç tane oldukları **Barkod Kapsamı** bölümünde yazar.

## Barkod Kapsamı

Her pazaryeri için bir kart vardır:

- Büyük yüzde ve altında **… / … üründe barkod biliniyor**: o pazaryerindeki ürünlerden kaçının barkodunun bilindiği.
- **Sayfa barkod bildirmedi**: ürün sayfasına bakıldı ama sayfada barkod yoktu.
- **Sorulup yanıt alınamadı**: ürün sayfası okunamadı.
- **Henüz sorulmadı**: bu ürüne barkod için henüz bakılmadı.

Henüz sorulmamış ürün varsa kartların altında bir not çıkar. **Barkod Tamamlama** işi bu ürünleri saatte bir, azar azar tamamlar. Ürün başına bir sayfa okunduğu için büyük bir markanın tamamı günler sürebilir. İşin durumunu [İşler](/rehber/jobs) ekranından görebilirsiniz.

Kapsam düşükse eşleşme sayısı da düşük olur. Örneğin 40 eşleşme, 40 ürünlük bir markada neredeyse tam kapsam, 500 ürünlük bir markada ise çok az demektir.

## Eşleşmeler

Bölüm başlığının yanında eşleşme sayısı yazar. Liste çok uzunsa **(liste kısaltıldı)** notu görünür.

- Arama kutusu: **Barkod veya ürün adı** ile listeyi daraltır.
- **Excel'e aktar**: görünen eşleşmeleri indirir.

Tablo sütunları:

- **Barkod**
- **Trendyol** ve **Hepsiburada**: o pazaryerindeki ürünün adı (tıklayınca pazaryerindeki sayfa yeni sekmede açılır) ve ürün kodu.

Hiç eşleşme yoksa _Henüz eşleşme yok._ yazar: iki pazaryerinde de barkodu bilinen ortak bir ürün gerekir.

## Sık sorulanlar

**Bir ürünün iki pazaryerinde de satıldığını biliyorum ama listede yok.**
İki karttan birinin barkodu henüz bilinmiyor olabilir. **Barkod Kapsamı** kartlarındaki **Henüz sorulmadı** sayısına bakın; barkodlar zamanla tamamlanır.

**Trendyol kartında barkod hiç bilinmiyor.**
Bazı ürün sayfaları barkod bildirmez. Bu ürünler **Sayfa barkod bildirmedi** satırında sayılır ve eşleşmeye giremez.

**Eşleşmeyi elle kurabilir miyim?**
Bu ekranda hayır. Kendi ürünlerinizi iki pazaryerindeki kartlara bağlamak için [Marka Stok](/rehber/brand-products) ekranında ürüne her iki kartı da bağlayın.

<!-- kaynak: doc 06 §12.4 (Faz 8); api-references §2.14 (meaning only); apps/web/src/app/watched-brands/cross-marketplace/cross-marketplace-client.tsx; lib/labels.ts (MARKETPLACE_LABELS, JOB_LABELS) -->
