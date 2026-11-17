---
id: concepts-buybox
title: Buybox
section: concepts
order: 2
module: null
routes: []
---

Bir ürünü birden fazla satıcı sattığında pazaryeri ürün sayfasında bir satıcıyı öne çıkarır. Müşteri **Sepete Ekle**'ye bastığında ürünü bu satıcıdan alır. Bu öne çıkan yere **buybox** denir. Satışların büyük kısmı buybox sahibine gider.

## Buybox nasıl kazanılır

Pazaryerleri buybox sahibini belirlerken fiyatın yanında satıcı puanı, kargo süresi ve stok gibi başka etkenlere de bakar. Fiyat en güçlü etkendir ama tek etken değildir. Bu yüzden bazen en ucuz satıcı buybox'ta olmayabilir.

## Uygulamada buybox

- **Sıra 1** ya da "buybox sizde", ürünün sayfasında öne çıkan satıcının siz olduğunuz anlamına gelir.
- **Buybox fiyatı**, o anda buybox'taki satıcının fiyatıdır.
- **İkinci / üçüncü fiyat**, sıradaki satıcıların fiyatlarıdır.

Satış modülü, buybox'ı **kâr bırakan en yüksek fiyatla** tutmaya çalışır: buybox'ı almak için fiyatı düşürür, aldıktan sonra kaybetmeden ne kadar yükseltebileceğini dener. Ayrıntılar: [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing).

Marka modülü ise buybox'taki fiyatın, markanın belirlediği fiyat bandının içinde olup olmadığını izler. Ayrıntılar: [Marka Alarmları](/rehber/brand-alerts).

## Tek satıcı

Ürünü sizden başka satan yoksa buybox zaten sizdedir. Bu durumda uygulama rakibe göre değil, ayarlardaki **hedef kâr oranına** göre fiyat belirler.

## Sık sorulanlar

**Fiyatım rakipten düşük ama buybox'ta değilim. Neden?**
Pazaryeri fiyat dışındaki etkenlere de bakar (satıcı puanı, teslim süresi, stok). Ayrıca buybox bilgisi birkaç dakikada bir yenilenir; değişiklik ekrana gecikmeli yansıyabilir.

**Buybox bilgisi ne sıklıkla güncellenir?**
Buybox gözlemi düzenli aralıklarla çalışan bir iştir. Son çalışma zamanını **İşler** ekranında ve üst çubuktaki tarama bilgisinde görebilirsiniz.

<!-- kaynak: doc 00, doc 03 §1, §2, §6.6; doc 17 §4, §5 -->
