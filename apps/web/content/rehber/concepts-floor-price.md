---
id: concepts-floor-price
title: Taban Fiyat (Dip Fiyat)
section: concepts
order: 1
module: seller
routes: []
---

Ekranlarda **Dip Fiyat** olarak da geçer; ikisi aynı şeydir.

**Taban fiyat**, bir ilanı zarar etmeden satabileceğiniz en düşük fiyattır. Bu fiyatta satış yaparsanız pazaryerinin kestiği komisyon, kargo ve diğer giderlerden sonra hesabınıza geçen tutar, ürünün size maliyetine tam olarak eşit olur.

## Neden önemli

Otomasyon fiyatı **hiçbir zaman** taban fiyatın altına indirmez. Rakipler ne kadar düşerse düşsün, uygulama zararına satış yapmaz. Bu, sistemin en temel güvencesidir.

Bir ilan zaten taban fiyatın altında satılıyorsa uygulama onu ilk fırsatta taban fiyata yükseltir. Karar açıklamasında _Zararına satılıyordu — taban fiyata çekildi_ yazar.

## Nasıl hesaplanır

Taban fiyat şu bilgilerden hesaplanır:

- Ürünün **birim maliyeti** (stok kalemindeki **Birim Fiyat (₺, KDV dahil)**). Paket ürünlerde bileşenlerin maliyetlerinin toplamı.
- Pazaryerinin **komisyon oranı**.
- Fiyata göre değişen **kargo** ve **diğer sabit giderler** (Ayarlar → Ücretler).
- Varsa kampanya indirimi ve indirimin size düşen payı.

Basit bir örnek (kampanya yok):

| | Tutar |
|---|---|
| Birim maliyet | 300 TL |
| Kargo | 40 TL |
| Diğer giderler | 10 TL |
| Komisyon oranı | %20 |

Taban fiyat = (300 + 40 + 10) ÷ (1 − 0,20) = **437,50 TL**.

Kontrol: 437,50 TL'lik satıştan %20 komisyon 87,50 TL kesilir; 40 TL kargo ve 10 TL gider düşülünce geriye 300 TL kalır, yani tam maliyet.

Kargo tutarı fiyata göre değiştiği için uygulama doğru kargo dilimini bulana kadar hesabı birkaç kez tekrarlar. Bir dilim sınırına denk geldiğinde her zaman **yüksek** olan fiyatı seçer; böylece taban fiyat asla gerçek değerinin altında kalmaz.

## KDV hakkında

Uygulama hiçbir hesapta KDV kullanmaz. Bunun yerine **tüm tutarlar KDV dahil** girilir: maliyet, kargo, giderler ve satış fiyatı. Hepsi aynı esasta olduğu için kâr ve zarar doğru çıkar.

> Maliyeti **KDV hariç** girerseniz taban fiyat olması gerekenden düşük hesaplanır ve zararına satış yapabilirsiniz. Ürün kaynağınız KDV hariç tutar veriyorsa içe aktarmadan önce KDV dahile çevirin.

## Taban fiyat hesaplanamıyorsa

- **Maliyet bilinmiyor** (kalem yok, maliyeti 0 ya da paket bileşeni eksik): ilan otomatik fiyatlamadan çıkarılır. Karar açıklamasında _Maliyet hesaplanamadı_ yazar. Stok ekranında maliyeti tamamlayın.
- **Komisyon tüm geliri alıyor**: hiçbir fiyatta kâr mümkün değildir; uygulama fiyat üretmez.
- **Ayarladığınız üst sınır taban fiyatın altında**: _Ayarlanan üst sınır taban fiyatın altında_ yazar. İlanın **Min/Max** değerini düzeltin.

## Sık sorulanlar

**Rakip benden ucuza satıyor, neden fiyatımı düşürmüyor?**
Rakibin fiyatı sizin taban fiyatınızın altındaysa uygulama inmez ve _Piyasa taban fiyatımızın altında — beklemede_ der. Rakip yükseldiğinde yeniden buybox için yarışır.

**Taban fiyatı elle değiştirebilir miyim?**
Doğrudan hayır; maliyet ve ücret ayarlarından hesaplanır. Daha yüksek bir alt sınır istiyorsanız ilanın **Min/Max** değerinden en düşük fiyatı yükseltin.

**Taban fiyat neden bir anda değişti?**
Maliyet, komisyon oranı, kargo/gider ayarları ya da bir kampanya değişmiş olabilir.

<!-- kaynak: doc 02 §0, §2, §4, §5; doc 03 §5, §6.7; apps/web/src/lib/labels.ts DECISION_REASON_LABELS; stock/stock-client.tsx -->
