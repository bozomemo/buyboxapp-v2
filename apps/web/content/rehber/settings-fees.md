---
id: settings-fees
title: Ücretler
section: screens
order: 43
module: seller
routes:
  - /settings/fees
---

**Ücretler** ekranında her pazaryeri için komisyon oranını, kargo tutarlarını ve diğer giderleri girersiniz. Uygulama bu değerlerle bir ürünün **taban fiyatını** hesaplar: altına inildiğinde zarar edilen fiyat. Bu nedenle değerlerin mağazanızın gerçek sözleşme koşullarıyla aynı olması önemlidir. Pazaryeriyle anlaşmanız değiştiğinde bu ekranı açın. Bkz. [Taban Fiyat](/rehber/concepts-floor-price) ve [Maliyet, Komisyon ve Kargo](/rehber/concepts-cost-and-fees).

Fiyat hesaplarında KDV kullanılmaz. Maliyet, komisyon, kargo ve gider tutarlarını satış fiyatıyla aynı temelde (KDV dahil) ve faturada gördüğünüz gibi girin.

## Pazaryeri

Ekranın en üstündeki **Pazaryeri** listesinden **Trendyol** veya **Hepsiburada**'yı seçin. Aşağıdaki form seçtiğiniz pazaryerinin ayarlarını gösterir. Henüz kayıt yoksa varsayılan değerler gösterilir ve bir not bunu belirtir.

## Ücret Ayarları

### Komisyon

**Varsayılan Komisyon Oranı (%)**: pazaryerinin satıştan aldığı yüzde. Pazaryeri bir ürün için kendi komisyon oranını bildirirse o kullanılır; bildirmezse bu oran kullanılır.

### Kargo

**Kargo Bantları (üst fiyat sınırı, tutar)**: satış fiyatına göre ödediğiniz kargo tutarı. Her satır bir banttır:

- **Üst sınır (boş = sınırsız)**: bu bandın geçerli olduğu en yüksek satış fiyatı. Son bandın üst sınırını boş bırakın.
- **Tutar**: bu fiyat aralığında ödenen kargo.

Bantlar yukarıdan aşağıya denenir; satış fiyatına uyan ilk bant kullanılır. Bu yüzden bantları küçük üst sınırdan büyüğe doğru sıralayın.

Örnek: üst sınır 150 TL → kargo 40 TL; üst sınır boş → kargo 25 TL. 120 TL'lik bir satışta 40 TL, 300 TL'lik bir satışta 25 TL kargo hesaplanır.

### Gider Payı

**Gider Bantları (alt fiyat sınırı, tutar)**: pazaryerinin kargo dışındaki sabit kesintileri (hizmet bedeli gibi). Her satırda **Alt sınır** ve **Tutar** vardır. Bantlar yukarıdan aşağıya denenir; alt sınırı satış fiyatına eşit ya da ondan küçük olan ilk bant kullanılır. Bu yüzden bantları büyük alt sınırdan küçüğe doğru sıralayın ve en alta alt sınırı 0 olan bir bant koyun.

Bant eklemek için **+ Bant Ekle**, silmek için satırdaki **Kaldır** düğmesini kullanın.

### Önizleme ve kaydetme

1. **Dip Fiyat Önizle**'ye tıklayın. Uygulama formdaki (henüz kaydedilmemiş) değerlerle 100 TL maliyetli bir ürünün taban fiyatını hesaplar ve gösterir: "100,00 ₺ maliyetli bir ürün için dip fiyat: …". Sonuç makul değilse değerleri kontrol edin.
2. **Kaydet**'e tıklayın. **Ücret ayarları kaydedildi.** mesajı görünür.

Kaydettiğinizde eski kayıt değiştirilmez; yeni değerler o andan itibaren geçerli olan yeni bir kayıt olarak eklenir. Böylece geçmiş fiyat kararları, o anda geçerli olan ücretlerle açıklanabilir kalır.

Kaydetme yalnızca Yönetici rolüne açıktır. Diğer roller değerleri görebilir.

## Geçmiş

Seçili pazaryerinin önceki ücret kayıtlarını, geçerli olmaya başladığı tarih ve **Komisyon** oranıyla listeler. Hiç kayıt yoksa **Bu pazaryeri için henüz kaydedilmiş bir ücret geçmişi yok.** yazar.

## Sık sorulanlar

**Ücretleri değiştirdim. Fiyatlar hemen değişir mi?**
Yeni değerler kaydedildiği andan itibaren yeni fiyat kararlarında kullanılır. Taban fiyat yükseldiyse, altında kalan ilanlar bir sonraki değerlendirmede yukarı çekilebilir. Otomasyonun nasıl çalıştığı için bkz. [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing).

**Tutarları KDV dahil mi, hariç mi girmeliyim?**
Faturada gördüğünüz gibi, KDV dahil girin. Uygulama hiçbir hesapta KDV ayırmaz veya eklemez.

**Ücret ayarı hiç kaydetmezsem ne olur?**
O pazaryeri için taban fiyat hesaplanamaz ve fiyatlandırma çalışmaz. [Fiyat Politikası](/rehber/settings-policy) ekranındaki **Etkiyi Önizle** de önce ücretlerin kaydedilmesini ister.

<!-- kaynak: doc 02 §0, §3, §5, doc 05 §2, doc 06 §9; apps/web/src/app/settings/fees/page.tsx, settings/fees/fees-client.tsx, packages/core/src/fee-model.ts (bant seçimi), app/api/settings/fees/save/route.ts -->
