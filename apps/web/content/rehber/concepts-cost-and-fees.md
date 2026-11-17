---
id: concepts-cost-and-fees
title: Maliyet, Komisyon ve Kargo
section: concepts
order: 3
module: seller
routes: []
---

Bir satıştan hesabınıza ne kadar para geçeceğini ve dolayısıyla [taban fiyatı](/rehber/concepts-floor-price) bu bölümdeki tutarlar belirler. Hepsi **KDV dahil** girilir; uygulama hiçbir hesapta ayrıca KDV eklemez ya da düşmez.

## Birim maliyet

Ürünün size maliyeti; **Stok** ekranındaki **Birim Fiyat (₺, KDV dahil)** alanı.

- Bir ilan birden fazla adet içeriyorsa (ör. 3'lü set) maliyet adet sayısıyla çarpılır.
- **Paket** olarak tanımlanan ürünlerde maliyet, bileşenlerin maliyetlerinin toplamıdır.
- Bir pazaryeri için maliyet çarpanı tanımlıysa o pazaryerindeki ilanların maliyeti bu çarpanla hesaplanır.

Maliyet bilinmeyen bir ilan için uygulama **fiyat üretmez**; o ilan otomatik fiyatlamadan çıkarılır.

## Komisyon

Pazaryerinin satış fiyatı üzerinden kestiği oran. Uygulama oranı pazaryerinin ilan bilgisinden okur. Pazaryeri oran vermezse **Ayarlar → Ücretler** ekranındaki **Varsayılan Komisyon Oranı (%)** kullanılır.

## Kargo ve diğer giderler

**Ayarlar → Ücretler** ekranında her pazaryeri için fiyat dilimlerine göre girilir: **Kargo Bantları** ve **Gider Bantları**. Örneğin "150 TL'ye kadar 35 TL kargo, üstü 50 TL". Satış fiyatı hangi dilime düşüyorsa o tutar kullanılır. Tutarları gerçekte ödediğiniz gibi, KDV dahil girin.

## Kampanyalar

Bir ilan kampanyadaysa müşterinin ödediği fiyat sizin belirlediğiniz fiyattan düşüktür. İndirimin bir kısmını pazaryeri, bir kısmını siz karşılarsınız. Uygulama bu bilgiyi pazaryerinden okur ve taban fiyatı müşterinin ödediği fiyata göre hesaplar.

## Bir satıştan elinize geçen

Kampanyasız bir satışta:

> Elinize geçen = Satış fiyatı − Komisyon − Kargo − Diğer giderler

Örnek: 500 TL'lik satış, %20 komisyon, 40 TL kargo, 10 TL gider → 500 − 100 − 40 − 10 = **350 TL**. Maliyet 300 TL ise kârınız 50 TL'dir.

## Sık sorulanlar

**Maliyeti KDV hariç girersem ne olur?**
Taban fiyat olması gerekenden düşük çıkar ve zararına satış yapabilirsiniz. Her zaman KDV dahil girin.

**Ücret ayarını değiştirdim, eski satışlar etkilenir mi?**
Hayır. Ücret ayarları geçerlilik tarihiyle saklanır; yeni ayar yalnızca bundan sonraki hesaplarda kullanılır. Önceki ayarları **Geçmiş** bölümünde görebilirsiniz. Kaydetmeden önce **Dip Fiyat Önizle**'ye tıklarsanız, girdiğiniz ayarlarla 100 TL maliyetli bir ürünün taban fiyatının ne olacağını görürsünüz.

<!-- kaynak: doc 02 §0, §2, §3, §4, §5.1 -->
