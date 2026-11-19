---
id: findings
title: Denetim Bulguları
section: screens
order: 28
module: brand
routes:
  - /watched-brands/findings
---

**Marka Denetimi → Denetim Bulguları** ekranı, bir markanın satış verisinden çıkan ve bakılmaya değer noktaları listeler: yasaklı satıcının markayı satması, tavsiye fiyatın altına inen satıcı, sistematik fiyat kıran satıcı gibi. Bir satıcıya ihtar göndermeden önce ya da haftalık marka denetiminde açın.

**Hiçbir bulgu bir ihlal iddiası değildir.** Her bulgu dayandığı ham gözleme kadar açılır; kararı okuyan verir. Ekran yalnızca raporlama içindir.

## Marka, dönem ve eşikler

- **Marka**: bulgular her zaman tek bir marka içindir, çünkü yetkili/yasaklı kararı markaya özeldir. Marka seçili değilse _Bulgular için bir marka seçin._ yazar.
- **Dönem**: **Son 7 gün**, **Son 30 gün** ya da **Son 90 gün**.
- **Eşikler**: bulguları üreten sayıları gösteren paneli açar. Bkz. [Eşikler](#esikler).

## Özet

- **Bulgu**: toplam bulgu sayısı; altında kaçının **kesin bilgi**, kaçının **yorum** olduğu.
- **Satıcı**: bu dönemde görülen satıcı sayısı.
- **Ürün**: bu dönemde görülen ürün sayısı.

### Kapsam ve bildirim notları

Bu açılır bölüm, bulgu olmamasının ne anlama geldiğini söyler. Örneğin:

- **Yetkili satıcı listesi tanımlı değil**: bu durumda **Yetkili listesinde yok** bulgusu hiç üretilmez. Liste olmaması herkesin yetkisiz olduğu anlamına gelmez. Listeyi [Satıcı Politikası](/rehber/seller-policy) ekranından girin.
- **Tavsiye edilen satış fiyatı girilmemiş** ya da **Tavsiye fiyat kapsamı: … / … ürün**: **Tavsiye fiyatın altında** bulgusu yalnızca bir ürününüze bağlı ve PSF'si olan kartlar için üretilir. PSF'yi [Marka Stok](/rehber/brand-products) ekranında girer, kartları orada ürünlere bağlarsınız.
- **Bildirim yapılandırılmamış**: bulgular hesaplanır ve saklanır ama kimseye iletilmez. Bildirim kurulumu için kurulumu yapan kişiye başvurun.
- Liste sınıra dayandığında kesildiğini söyleyen uyarılar. Gösterilenler en derin sapanlardır; ilgili eşiği yükseltmek listeyi daraltır.

## Bulgular

Bulgular iki gruba ayrılır:

- **Kesin bilgi** (kırmızı rozet): sizin yazdığınız bir kayda dayanır. Örneğin "yasaklı satıcı bu markayı satıyor" bir yorum değildir; kuralı siz yazdınız, satıcı da sayfada. Bu grup her zaman önce gelir.
- **Yorum** (gri rozet): gözlenen fiyatlardan çıkarılır; döneme ve eşiklere göre değişir.

Listenin üstündeki düğmeler bulgu türlerini ve sayılarını gösterir. Bir türe tıklayınca gizlenir, tekrar tıklayınca geri gelir. **Excel'e Aktar** görünen bulguları indirir.

Her bulgu kartında tür, konu (satıcı ya da ürün; tıklayınca [Satıcı Ayrıntısı](/rehber/seller-detail) ya da [ürün sayfası](/rehber/tracked-products#urun-ayrinti-sayfasi) açılır), bulgunun ne zamandır açık olduğu ve tek cümlelik açıklama yer alır.

### Bulgu türleri

| Bulgu | Anlamı |
|---|---|
| **Yasaklı satıcı satışta** | Bu marka için yasaklı işaretlediğiniz satıcı dönem içinde ürünlerinizde görüldü |
| **Tavsiye fiyatın altında** | Satıcı bir kartı, PSF × çarpanın tolerans kadar altında sattı. Dönemdeki en düşük teklif gösterilir |
| **Yetkili listesinde yok** | Yetkili satıcı listeniz var ve bu satıcı listede yok |
| **Tek üründe derin indirim** | Satıcı tek bir üründe piyasanın çok altında, diğer ürünlerinde ise piyasaya yakın |
| **Sistematik fiyat kırma** | Satıcı kendi tekliflerinin büyük kısmında listenin en ucuzu, birden çok üründe |
| **Piyasa altı ortalama** | Satıcının fiyatları, bulunduğu listelemelerin ortalamasının belirgin altında |
| **Yeni görülen satıcı** | Satıcı yakın zamanda ilk kez görüldü. Bu bir gözlem tarihidir, satışa başlama tarihi değil |
| **Alakasız kategori** | Ürün, markanın neredeyse hiç ürünü olmayan bir kategoride listelenmiş |
| **Marka eşleşmesi uyuşmuyor** | Ürün markanın arama terimiyle bulundu ama pazaryeri onu markanın marka id'sine bağlamıyor. Ya ürün başka markanın altında listelenmiş ya da marka adını başka bir firma kullanıyor |

### Kanıt

Bir bulgunun **Kanıt** düğmesine tıklayınca dayandığı ham bakışlar açılır (**Kanıtı kapat** ile kapanır). Her bakışta o anki **tüm** teklifler listelenir: **Sıra**, **Satıcı**, **Fiyat**, **Kupon sonrası** ve **Stok**. Bulgunun konusu olan satıcının satırı vurgulanır. Kimliği okunamayan teklifler **kimliksiz teklif** olarak gösterilir. **Pazaryerindeki sayfa ↗** ürünün sayfasını açar.

Sayılar **tekliflerden** gelir: bir satıcının ürünü kaç kez listelediğini gösterir, kaç adet sattığını değil.

## Eşikler

**Eşikler** düğmesi bulguları üreten sayıları açar. Sağ üstte **Varsayılan değerler kullanılıyor** ya da **Bu kurulum için değiştirilmiş** yazar.

| Eşik | Ne işe yarar |
|---|---|
| **Piyasa altı sapma** (%) | Satıcının ortalaması piyasanın bu kadar altındaysa bulgu |
| **Derin indirim** (%) | Tek bir üründe bu kadar altta olmak bulgudur |
| **Derin indirim karşıtlığı** (%) | Ama satıcının diğer ürünleri piyasaya bu kadar yakın olmalı; yoksa zaten ucuz bir satıcıdır |
| **En ucuz olma oranı** (%) | Kendi tekliflerinin bu kadarında en ucuzsa sistematik sayılır |
| **En az ürün** | Sistematik sayılması için en az bu kadar üründe görülmeli |
| **Yeni satıcı** (gün) | İlk kez bu kadar gün içinde görülen satıcı yenidir |
| **En az gözlem** | Bunun altında hiçbir yorum bulgusu üretilmez; kesin bilgi bulguları etkilenmez |
| **Tavsiye fiyat toleransı** (%) | PSF'nin bu kadar altına inen satıcı bulgudur. Sıfır değildir, çünkü liste fiyatı liraya yuvarlıdır |
| **Seyrek kategori payı** (%) | Markanın ürünlerinin en fazla bu kadarını barındıran kategori olağandışıdır |
| **Seyrek kategori ürün sayısı** | Ve en fazla bu kadar ürün |

Ondalık değerleri virgülle yazın (2,5). **Kaydet ve yeniden hesapla** yeni eşikleri kaydeder ve tüm dönemi yeniden değerlendirir. **Varsayılanlara dön** değişiklikleri geri alır. Eşik değişiklikleri kimin değiştirdiğiyle birlikte kaydedilir. Eşikleri değiştirmek Yönetici ve Fiyat Yöneticisi rollerine açıktır.

Hiç bulgu çıkmıyorsa _Bu dönemde ve bu eşiklerle bulgu yok._ yazar ve **Eşikleri aç** düğmesi görünür. Eşikler bir keşif aracıdır; daraltarak deneyebilirsiniz.

## Sık sorulanlar

**"Tavsiye fiyatın altında" bulgusu hiç çıkmıyor.**
Kartlarınız PSF'si olan bir ürüne bağlı olmayabilir. **Kapsam ve bildirim notları** bölümündeki kapsam sayısına bakın ve [Marka Stok](/rehber/brand-products) ekranında kartları ürünlere bağlayın.

**"Yetkili listesinde yok" bulgusu görünmüyor.**
Bu bulgu yalnızca seçili marka için bir yetkili satıcı listesi girildiyse üretilir. [Satıcı Politikası](/rehber/seller-policy) ekranından girin.

**Bir bulgu ihlal kanıtı mıdır?**
Hayır. Bulgu "şuraya bak" der. **Kanıt** ile ham bakışları inceleyin; ihtar kararını siz verirsiniz.

**Bu ekran ile Marka Alarmları arasındaki fark nedir?**
[Marka Alarmları](/rehber/brand-alerts) yalnızca buybox'taki satıcının fiyat aralığınızın dışında olup olmadığına bakar. Bu ekran tüm satıcılara bakar ve yetkili listesi, fiyat kırma gibi farklı soruları cevaplar.

<!-- kaynak: doc 06 §12.4 (Faz 6); doc 17 §2.5, §5.1; apps/web/src/app/watched-brands/findings/findings-client.tsx; lib/labels.ts (FINDING_KIND_LABELS, FINDING_BASIS_LABELS); api/brand-reports/thresholds permissions -->
