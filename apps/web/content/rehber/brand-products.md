---
id: brand-products
title: Marka Stok
section: screens
order: 20
module: brand
routes:
  - /brand/products
  - /brand/products/[id]
---

**Marka Denetimi → Stok** ekranı kendi ürünlerinizin listesidir. Her ürün için PSF (tavsiye satış fiyatı) ve isterseniz bir min/max fiyat aralığı yazarsınız; sonra ürünü Trendyol ve Hepsiburada'daki ürün sayfalarına (bu rehberde **kart** diyoruz) bağlarsınız. Bir ürün birden çok karta bağlanabilir: aynı ürün iki pazaryerinde, ya da tekli ve üçlü paket olarak ayrı kartlarda satılıyor olabilir. Fiyat aralığı alarmı ve [İlanlar](/rehber/brand-listings) ekranı bu bağlara dayanır. Ürün listenizi ilk kez kurarken ya da fiyatlarınızı değiştirdiğinizde bu ekranı açın.

## Fiyatlar birim başınadır

**PSF**, **Min** ve **Max** her zaman **bir adet ürün** içindir. Üçlü paket satan bir kart, karta yazdığınız **adet çarpanı** (bu örnekte 3) ile ölçeklenerek karşılaştırılır. Örnek: PSF 500 TL ise üçlü paket kartı için tavsiye fiyat 1.500 TL'dir.

Aralığın sınırları şöyle belirlenir:

- **Alt sınır** = **Min**. Min boşsa alt sınır alarmı yoktur.
- **Üst sınır** = **Max**. Max boşsa üst sınır **PSF**'dir. PSF zorunlu olduğu için her ürünün bir üst sınırı vardır.
- Sınırın tam üstündeki fiyat aralık içinde sayılır.

Alarmın nasıl çalıştığı için bkz. [Marka Alarmları](/rehber/brand-alerts).

## Excel'den yükle

Çok sayıda ürünü bir dosyayla eklemek ya da güncellemek için bu kartı kullanın. Bu işlem Yönetici ve Fiyat Yöneticisi rollerine açıktır; **Şablon indir** herkese açıktır.

1. **Şablon indir**'e tıklayıp örnek dosyayı alın ve doldurun.
2. **Dosya** alanında `.xlsx` veya `.csv` dosyanızı seçin.
3. **Önizle**'ye tıklayın. Bu adımda hiçbir şey kaydedilmez.
4. Özet satırını ve sorun listesini okuyun.
5. Sonuç uygunsa **Geçerli N satırı içe aktar**'a tıklayın. Yalnızca hatasız satırlar yazılır.

Dosyayı önizlemeden sonra değiştirirseniz önizleme silinir; yeni dosya için yeniden **Önizle**'ye tıklayın.

### Mevcut ürünleri toplu düzenleme

**Mevcut ürünleri indir**, kayıtlı bütün ürünleri şablonla aynı sütunlarla, değerleri dolu olarak indirir. Herkese açıktır. Örneğin bütün ürünlere **Birim Fiyat** ve **Desi** eklemek için:

1. **Mevcut ürünleri indir**'e tıklayın.
2. Dosyada yalnızca değiştirmek istediğiniz hücreleri doldurun ya da düzeltin. Diğer hücrelere dokunmayın.
3. Dosyayı yukarıdaki adımlarla **Önizle**'yip içe aktarın. Özet satırında yeni ürün sayısı 0 olmalıdır.

Her satır, linkindeki kart üzerinden kendi ürününü bulur; bu yüzden link sütunlarını değiştirmeyin. Link sütununa ürünün o pazaryerindeki birincil kartı yazılır. Birincil kartı yoksa, örneğin kartı ürün ekranından elle bağladıysanız, ürünün çarpanı 1 olan tek kartı yazılır. Bir pazaryerinde çarpanı 1 olan birden çok kart varsa ve hiçbiri birincil değilse o sütun boş kalır. Ürün ekranından bu kartlardan birini birincil yapın. Dosyadaki diğer değerler kayıtlı olanlarla aynı olduğu için boş bıraktığınız alanlar silinmez; ancak bir hücreyi siz boşaltırsanız o değer silinir.

### Sütunlar

| Sütun | Zorunlu mu | Anlamı |
|---|---|---|
| **Ürün Adı** | Evet | Ürünün adı |
| **PSF** | Evet | Birim tavsiye satış fiyatı. `1.249,90` ya da `1249.90` yazılabilir |
| **Min Fiyat** | Hayır | Birim alt sınır. Boşsa alt sınır alarmı yok |
| **Max Fiyat** | Hayır | Birim üst sınır. Boşsa üst sınır PSF |
| **Trendyol Linki** | İkisinden en az biri | Ürünün Trendyol'daki birincil kartı |
| **Hepsiburada Linki** | İkisinden en az biri | Ürünün Hepsiburada'daki birincil kartı |
| **Barkod** | Hayır | Kart önerileri için kullanılır |
| **Birim Fiyat** | Hayır | Ürünü satıcılara sattığınız birim fiyat; yalnızca kâr tahmininde kullanılır |
| **Desi** | Hayır | Kargo desisi; yalnızca kâr tahmininde kullanılır |

Başlık satırı dosyanın ilk dolu satırı olmalıdır. Başlıklarda büyük/küçük harf ve Türkçe karakter farkı önemli değildir.

### Dosya mevcut ürünleri nasıl günceller

- Bir satır, linklerinden biri mevcut bir ürünün **birincil** kartıyla aynıysa o ürünü günceller. Değilse yeni ürün açılır ve linkler birincil kart olarak (çarpan 1) bağlanır.
- **Dolu hücre yazar, boş hücre siler.** Ürün Adı, PSF, Min Fiyat, Max Fiyat ve Barkod için geçerlidir. Örneğin boş bir **Min Fiyat**, daha önce girilmiş min'i kaldırır.
- **Boş link sütunu hiçbir şeyi değiştirmez.** Bir kartın bağını kaldırmak ürün sayfasından yapılır.
- **Birim Fiyat** ve **Desi** sütunları dosyada hiç yoksa ürünlerdeki değerler korunur. Sütun varsa boş hücre değeri siler.
- Dosyada olmayan ürünlere dokunulmaz. İçe aktarma hiçbir ürünü silmez.
- İçe aktarma pazaryerine bir istek göndermez. Yeni kartlara bir sonraki İlanlar turunda bakılır.

### Önizleme sonucu

Özet satırında **Toplam**, **Yeni ürün**, **Güncellenecek**, **Bağlanacak kart** (yanında kaç tanesinin yeni takip edileceği) ve **Alınmayacak satır** sayıları görünür.

- **İçeri alınacak ama dikkat edilmesi gereken … satır**: bu satırlar alınır, ama kontrol etmeniz iyi olur. Örneğin _PSF, min fiyatın altında._, _Bu adı taşıyan başka bir ürün daha var._ (yalnızca gerçekten başka bir ürün aynı adı taşıyorsa; güncellenen ürünün kendi adı sayılmaz) ya da _Barkod geçerli bir EAN/GTIN değil; pazaryeri kartlarıyla eşleşmez._
- **… satır içeri alınmayacak**: tabloda **Satır**, **Sütun** ve **Sorun** yazar. **Hatalı satırları indir** bu satırları sorunlarıyla birlikte bir dosya olarak verir; düzeltip yalnızca onları yeniden yükleyebilirsiniz.

Sık görülen hatalar:

- _Link tanınamadı._ Linki doğrudan ürün sayfasından kopyalayın.
- _Link yanlış sütunda_: Trendyol linki Hepsiburada sütununa yazılmış (ya da tersi).
- _Bu link ürün ailesini gösteriyor, satılan varyantı değil._ Hepsiburada'da varyantı (renk, boyut) seçip o sayfanın linkini kopyalayın.
- _Bu kart "…" ürününe ek kart olarak bağlı._ Bir kart yalnızca bir ürüne bağlanabilir.
- _İki link iki ayrı ürüne ait_: satırdaki iki link farklı ürünlerin birincil kartı. Hiçbir şey birleştirilmez.
- _Barkod Excel'de bilimsel gösterime dönmüş_: Barkod sütununu **Metin** biçimine çevirip barkodları yeniden yazın.
- _Min fiyat üst sınırın üstünde_: bu durumda hiçbir fiyat aralıkta kalmaz.

## Ürünler

### Arama ve filtre

- **Ara (ad veya barkod)**: yazıp Enter'a basın ya da **Ara**'ya tıklayın.
- **Yalnızca kartı olmayanlar**: henüz hiçbir karta bağlanmamış ürünleri gösterir. Bu ürünler için fiyat izlenmez ve alarm üretilmez.

### Yeni ürün ekleme ve düzenleme

**Yeni Ürün**'e ya da bir satırdaki **Düzenle**'ye tıklayınca form açılır:

- **Ürün adı**
- **PSF (birim)**: zorunlu.
- **Min (birim)**: boş bırakırsanız alt sınır alarmı olmaz.
- **Max (birim)**: boş bırakırsanız üst sınır PSF olur.
- **Barkod**: kart önerileri için.
- **Birim fiyat (KDV dahil)**: ürünü satıcılara sattığınız fiyat.
- **Desi**: ürünün kargo desisi, örneğin `4,5`.

**Birim fiyat** ve **Desi** yalnızca [İlanlar](/rehber/brand-listings) ekranındaki tahmini satıcı kârında kullanılır; alarmı etkilemez. Kaydetmek için **Ekle** (yeni ürün) ya da **Güncelle**'ye tıklayın. PSF kendi aralığınızın dışındaysa ürün yine kaydedilir ve **Dikkat:** ile başlayan bir uyarı görürsünüz.

Ekleme, düzenleme ve silme Yönetici ve Fiyat Yöneticisi rollerine açıktır.

### Sütunlar

- **Ürün**: ürün adı. Tıklayınca ürün sayfası açılır.
- **PSF**: birim tavsiye fiyat.
- **Min**: birim alt sınır. **—** ise alt sınır alarmı yoktur.
- **Üst sınır**: birim üst sınır. Yanında küçük **PSF** yazıyorsa Max girilmemiştir ve PSF geçerlidir.
- **Barkod**
- **Birim fiyat**: satıcılara satış fiyatınız.
- **Desi**
- **Kart**: bağlı kart sayısı ve pazaryerleri. **yok** (turuncu) ise ürün hiçbir karta bağlı değildir.
- **Kaynak**: ürünün nereden geldiği: **El ile**, **Excel** ya da **Taşınan** (eski sürümden aktarılan).
- **Güncellendi**: son değişiklik zamanı.

### Silme

**Sil**'e tıklayıp onaylayın. Ürün ve ona ait fiyat aralığı ihlalleri silinir. Kartları **Takip Edilen Ürünler** listesinde kalır.

## Ürün sayfası

Listede bir ürün adına tıklayınca ürünün kendi sayfası açılır. **Stok listesine dön** sizi listeye geri götürür.

### Özet kutuları

**Birim PSF**, **Min**, **Üst sınır**, **Bağlı kart**, **Birim fiyat (satıcıya)** ve **Desi**. Birim fiyat ya da desi girilmemişse altında _Girilmemiş — kâr tahmini yapılamaz_ yazar.

### Bant piyasadan uzak olabilir

Son 30 günde bağlı kartlarda kaydedilen bütün satıcı fiyatları üst sınırın üstünde ya da Min'in altındaysa özet kutularının altında sarı **Bant piyasadan uzak olabilir** notu çıkar. Notta kaç fiyata bakıldığı ve birim başına ortanca fiyat yazar. Fiyatlar çarpanlı kartlarda da kartın kendi sınırıyla karşılaştırılır.

Bu not bir uyarıdır: bandınız piyasayı anlatmıyor olabilir ya da piyasa topluca bandın dışına çıkmış olabilir. Hangisi olduğuna siz karar verirsiniz; alarmlar değişmez. En az 10 fiyat kaydı olmadan not çıkmaz.

### Bağlı kartlar

Kartın adına tıklayınca kart pazaryerinde yeni sekmede açılır. Bağlantı belirli bir satıcıya kilitli değildir; sayfa o an buybox'ta kim varsa onunla açılır.

Her satır bu ürüne bağlı bir karttır:

- **Pazaryeri**
- **Kart**: kartın adı; tıklayınca pazaryerindeki sayfa yeni sekmede açılır. Altında ürün kodu yazar; **pasif** kartın düzenli taramadan çıkarıldığını, **satıcısız** son bakışta kimsenin satmadığını gösterir.
- **Çarpan**: bir alışta kaç adet ürün gittiği. Kutudaki sayıyı değiştirip kutudan çıkınca kaydedilir. 1 veya daha büyük tam sayı olmalıdır.
- **Kart PSF**: PSF × çarpan, yani bu kartın kendi fiyatıyla doğrudan karşılaştırılabilen tavsiye fiyat.
- **Kart alt/üst**: kart için alt ve üst sınır (birim sınır × çarpan).
- **Birincil**: **evet** ise bu kart, Excel içe aktarımında bu ürünü bulan karttır. Başka bir kartı birincil yapmak için **Birincil yap**'a tıklayın; eski birincil kart bağlı kalır.
- **Bağ**: bağın nasıl kurulduğu: **el ile**, **Excel**, **barkod önerisi** ya da **taşıma**.
- **Son bakış**: karta en son ne zaman bakıldığı. **hiç bakılmadı** ise henüz okunmamıştır.
- **Bağı kaldır**: onay ister. Kartın açık fiyat ihlalleri kapanır; kart takip listesinde kalır.

### Kart ekle

1. **Ürün linki** alanına Trendyol veya Hepsiburada ürün sayfasının linkini yapıştırın. Takip listesinde olmayan bir kartsa takibe eklenir.
2. **Adet çarpanı** alanına bir alışta kaç adet ürün gittiğini yazın. Bu alan bilerek boş gelir; her kart için siz cevaplamalısınız. Boş bırakırsanız alanın hemen altında ne yazmanız gerektiği söylenir (tek ürünse 1, 3'lü paketse 3).
3. Bu kart o pazaryerinde ana kart olacaksa **Bu pazaryerinde birincil kart olsun** kutusunu işaretleyin.
4. **Bağla**'ya tıklayın.

### Bu kart senin ürünün olabilir

Ürüne barkod yazdıysanız, aynı barkodu taşıyan ve henüz hiçbir ürüne bağlı olmayan kartlar burada önerilir. Öneriler kendiliğinden bağlanmaz.

1. Önerinin yanındaki **Bunu bağla**'ya tıklayın. Kart **Kart ekle** formuna yerleşir.
2. **Adet çarpanı**'nı yazın ve **Bağla**'ya tıklayın.

Trendyol kartları barkod vermez, Hepsiburada verir. Bu yüzden öneriler şimdilik yalnızca Hepsiburada kartları için gelir.

Kart bağlama, çarpan değiştirme, birincil yapma ve bağ kaldırma Yönetici ve Fiyat Yöneticisi rollerine açıktır.

## Sık sorulanlar

**Üçlü paket satan bir kartı nasıl bağlarım?**
Ürün sayfasında **Kart ekle** ile linki yapıştırın ve **Adet çarpanı**'na 3 yazın. PSF'yi değiştirmeyin; PSF birim başınadır ve kart için kendiliğinden 3 ile çarpılır.

**Excel'de Min Fiyat'ı boş bıraktım, eski min'im silindi. Neden?**
Dosyadaki boş hücre o değeri siler. Min'i korumak istiyorsanız dosyada da yazılı olmalıdır.

**Bir ürünü sildim, kartları da silindi mi?**
Hayır. Kartlar **Takip Edilen Ürünler** listesinde kalır; yalnızca ürünle bağları ve açık fiyat ihlalleri gider.

**Ürünüm için alarm gelmiyor.**
**Kart** sütununda **yok** yazıyor olabilir: kartı olmayan ürün için fiyat izlenmez. Kart bağlıysa [Marka Alarmları](/rehber/brand-alerts) ekranındaki uyarı şeridine bakın.

**Yeni Ürün düğmesini göremiyorum.**
Ürün ekleme ve düzenleme Yönetici ve Fiyat Yöneticisi rollerine açıktır. Bkz. [Roller](/rehber/concepts-roles).

<!-- kaynak: doc 17 §2–§3, §5.3, §8.1; brand roadmap §6.12; apps/web/src/app/brand/products/brand-products-client.tsx, import-panel.tsx, [id]/brand-product-detail-client.tsx, [id]/band-realism-note.tsx; apps/web/src/lib/labels.ts (IMPORT_*); api/brand-products/** permissions -->
