---
id: brand-sellers
title: Marka Satıcıları
section: screens
order: 26
module: brand
routes:
  - /watched-brands/sellers
---

**Marka Denetimi → Marka Satıcıları** ekranı (sayfa başlığı **Markalarımı Kimler Satıyor**), izlediğiniz markaların ürünlerinde görülen satıcıları listeler. "Markamı kim, kaç üründe, hangi fiyatla satıyor ve buybox kimde?" sorusunun cevabıdır. Yetkisiz satıcıları ve piyasanın çok altında satanları bulmak için açın.

Sayılar **tekliflerden** gelir: bir satıcının ürünü kaç kez listelediğini gösterir, kaç adet sattığını değil. Hiçbir pazaryeri satış adedi vermez. Ekran yalnızca raporlama içindir.

## Filtreler

- **Kapsam**: **Tüm markalar**, bir grubun tamamı (**… — tümü**) ya da tek bir marka. **Politika** sütunu yalnızca tek bir marka seçildiğinde dolar, çünkü yetkili/yasaklı kararı markaya özeldir.
- **Dönem**: **Son 7 gün**, **Son 30 gün** ya da **Son 90 gün**.
- **Pazaryeri**: **Tümü**, **Trendyol** ya da **Hepsiburada**.

## Özet kutuları

Tablonun üstünde, duruma göre şu kutular çıkar:

- Kırmızı kutu: **… yasaklı satıcı piyasanın belirgin altında satıyor.** Hem [Satıcı Politikası](/rehber/seller-policy)'nda yasaklı olan hem de ortalama piyasanın %15 veya daha altında fiyat veren satıcılar. Denetimin aradığı asıl durum budur.
- Buybox özeti: dönemde markanın kaç kayıtlı buybox anı olduğu ve buybox'ın %20'den fazlasını tek bir satıcı tutuyorsa onun adı ve payı. Kimliği okunamayan buybox anları ayrıca belirtilir.
- Turuncu kutu: **… satıcı** ortalama olarak piyasanın %15 veya daha altında fiyat veriyor. Bu tek başına bir ihlal değildir; yalnızca bakılacak yeri gösterir.
- Turuncu kutu: pazaryeri satıcı kimliği vermediği için listede yer almayan teklif sayısı. Bu teklifler isme göre eşleştirilmez; aynı isim aynı firma demek değildir.

Buybox payı **kayıtlı bakışlar** üzerinden hesaplanır, süre üzerinden değil. Fiyatı sık değişen ürünler bu sayıda daha ağır basar.

## Sütunlar

**Sütunlar** menüsünden gizli sütunları açabilirsiniz. **Excel'e Aktar** tüm satıcıları indirir.

- **Satıcı**: satıcının adı. Tıklayınca [Satıcı Ayrıntısı](/rehber/seller-detail) sayfası, bu ekrandaki dönem ve marka seçiliyken açılır. Yanında satıcının grubu ve altında varsa sizin notunuz görünür.
- **Politika**: seçili markada satıcının durumu:
  - **Yetkili** (yeşil): yetkili satıcı listenizde.
  - **Yasaklı** (kırmızı): yasaklı olarak işaretlenmiş.
  - **Tanımsız** (gri): hakkında henüz kural yok. Satıcıların çoğu bu durumdadır; "yetkisiz" anlamına gelmez. Yanındaki **Yetkili** ve **Yasaklı** düğmeleri seçili marka için bu satıcıya tek tıkla kural yazar. Satıcı son 7 günde ilk kez görüldüyse **yeni** yazar.
  - **marka seçin**: kapsamda tek bir marka seçili değil.
- **Pazaryeri** (gizli).
- **Ürün**: satıcının görüldüğü ürün sayısı.
- **Teklif** (gizli): kayıtlı teklif sayısı.
- **Buybox**: satıcının buybox'ı tuttuğu bakış sayısı; parantez içinde kendi tekliflerinin yüzde kaçında buybox'ta olduğu.
- **Buybox payı**: markanın tüm buybox anları içinde bu satıcının payı. %50 ve üstü turuncu yazılır. Bir satıcı kendi tekliflerinin %90'ında kazanıp markanın yalnızca %2'sini tutabilir; bu iki sütun o farkı gösterir.
- **En ucuz**: satıcının en ucuz teklif olduğu bakış sayısı ve oranı.
- **Piyasa sapması**: satıcının fiyatının, bulunduğu her listelemedeki ortalama fiyattan yüzde farkı. %15 veya daha altındaysa turuncu yazılır.
- **Fiyat aralığı**: dönemdeki en düşük ve en yüksek fiyatı.
- **İlk görülme** (gizli): ≥ ile gösterilir, çünkü bu bir gözlem tarihidir; satıcı daha önce de orada olabilir.
- **Son görülme**
- **Kimlik**: satıcının firma bilgilerini gösteren paneli açar. Kimliği daha önce çözülmüş satıcıda düğme **✓ Kimlik** olarak görünür; üzerine gelince ticari unvan yazar.

## Satıcı kimliği

**Kimlik**'e tıklayınca tablonun üstünde bir panel açılır. Bir satıcıya ihtar yazacaksanız gereken bilgiler buradadır.

1. Kimlik daha önce okunmadıysa **Kimliği çöz**'e tıklayın. İş kuyruğa alınır ve panel sonucu bekler (**Çözülüyor…**).
2. Sonuç gelince **Ticari unvan**, **Vergi / TC no**, **Vergi dairesi**, **KEP adresi**, **Adres**, **Şehir** ve **Ülke** görünür. Okunamayan alan **—** ile gösterilir.
3. **Bu sayfadaki listelemesi** tablosunda satıcının o ürün sayfasındaki **Barkod**, **Varyant** ve **Stok** bilgisi yer alır.
4. Altta bilginin ne zaman okunduğu ve **okunduğu sayfa** bağlantısı bulunur.

- **Yeniden çöz**: bilgiyi yeniden okur; yeni sonuç eskisinin yerine geçer.
- **Kimliği unut**: okunan bilgiyi onay sonrası siler. Yeniden okumak pazaryerine yeni bir istek gerektirir.
- **Kapat**: paneli kapatır.

Satıcı kaydınızdaki vergi numarası pazaryerinin bildirdiğinden farklıysa turuncu bir uyarı çıkar. Kayıttaki numara değiştirilmez; yetkili satıcı listesi onunla eşleşir ve hangisinin doğru olduğuna siz karar verirsiniz.

İki dakika içinde sonuç gelmezse _Çözüm tamamlanmadı_ mesajı çıkar; [İşler](/rehber/jobs) ekranından son çalıştırmalara bakın.

### Birden çok satıcının kimliği

Her satırın başında bir onay kutusu vardır; başlıktaki kutu o sayfadaki bütün satıcıları seçer. Satıcı seçince tablonun üstünde **… satıcı seçildi** yazar ve şu düğmeler görünür:

- **Seçilenlerin kimliğini çöz**: seçilen satıcıların kimliğini arka planda, sırayla çözer. Satıcılar tek tek **Kimliği çöz**'e basılmış gibi okunur: dakikada en fazla 6 sayfa, aynı anda tek satıcı. 100 satıcı yaklaşık yarım saat ile iki saat sürer. Ekrandan ayrılabilirsiniz; ilerlemesi [İşler](/rehber/jobs) ekranında **Seçili Satıcıların Kimliği (raporlama)** adıyla görünür.
- **Seçimi temizle**: seçimi kaldırır.

Kimliği zaten çözülmüş satıcılar yeniden okunmaz; mesajda kaç tanesinin atlandığı yazar. Birini yenilemek isterseniz o satıcının panelinde **Yeniden çöz**'e basın. Tek seferde en fazla 200 satıcı seçebilirsiniz. Önceki seçim kuyrukta ya da çalışırken yeni bir seçim kabul edilmez. Kimliği çözülemeyen bir satıcı diğerlerini durdurmaz; nedeni [Olaylar](/rehber/events) ekranına yazılır.

Pazaryerine giden her istek gerçek bir sayfa okumasıdır. Yalnızca gerçekten ihtiyaç duyduğunuz satıcıları seçin.

### Kimlikleri Excel'e aktarma

**Kimlikleri Excel'e aktar**, şimdiye kadar çözülmüş bütün satıcı kimliklerini indirir: satıcı, satıcı kodu, pazaryeri, **Ticari Unvan**, **Vergi / TC No**, **Vergi Dairesi**, **KEP Adresi**, adres, şehir, ülke, okunma tarihi ve okunduğu sayfa. Bu düğme pazaryerine istek göndermez; kimliği hiç çözülmemiş satıcılar dosyada yer almaz. Dosyaya ekranda seçili dönem, marka ya da pazaryeri uygulanmaz. Henüz hiç kimlik çözülmediyse dosya inmez; **Henüz kimliği çözülmüş satıcı yok.** mesajı çıkar.

Kimliği çözme (tek tek ya da seçerek) ve unutma Yönetici ve Fiyat Yöneticisi rollerine açıktır. **Kimlikleri Excel'e aktar** her role açıktır.

## Sık sorulanlar

**Tablo boş, "Bu dönemde hiç teklif kaydı yok" yazıyor.**
Marka kataloğu taraması ürünleri bulur ama satıcı ve fiyat getirmez. [İzlenen Markalar](/rehber/watched-brands) ekranında **Şimdi tara**'yı kullanın ve [İşler](/rehber/jobs) ekranında satıcı taramalarının açık olduğunu kontrol edin.

**Politika sütununda neden "marka seçin" yazıyor?**
Yetkili ve yasaklı kararları markaya özeldir. **Kapsam**'tan tek bir marka seçin.

**Bir satıcıyı yasaklı ya da yetkili olarak nasıl işaretlerim?**
**Kapsam**'tan tek bir marka seçin; **Tanımsız** satıcının yanındaki **Yetkili** ya da **Yasaklı** düğmesine basın. Kural bu marka ve bu mağaza için yazılır. Not eklemek, vergi numarasıyla kural yazmak ya da kuralı bütün gruba uygulamak için [Satıcı Politikası](/rehber/seller-policy) ekranını kullanın. Düğmeler Yönetici ve Fiyat Yöneticisi rollerine açıktır.

**Piyasanın altında satan her satıcı kural ihlali mi yapıyor?**
Hayır. Piyasa sapması yalnızca bakılacak yeri gösterir. İhlal olup olmadığı satıcının yetkili olup olmadığına ve sizin kurallarınıza bağlıdır; bkz. [Denetim Bulguları](/rehber/findings).

**Bütün satıcıların kimliğini tek tuşla çözebilir miyim?**
Hayır. Kimlik yalnızca seçtiğiniz satıcılar için çözülür; her satıcı pazaryerine gerçek bir istek demektir. Başlıktaki kutuyla bir sayfadaki satıcıları seçip **Seçilenlerin kimliğini çöz**'e basabilirsiniz.

**Kimlik dosyasında bazı satıcılar yok.**
Dosya yalnızca kimliği çözülmüş satıcıları içerir. Eksik satıcıları seçip **Seçilenlerin kimliğini çöz**'e basın; iş bitince dosyayı yeniden indirin.

<!-- kaynak: doc 06 §12.4; brand roadmap §6.12; apps/web/src/app/watched-brands/sellers/brand-sellers-client.tsx, policy-quick-decision.tsx, seller-identity-panel.tsx; lib/labels.ts (POLICY_VERDICT_LABELS); api/brand-reports/sellers, api/competitors/sellers/identity (+ bulk, export) permissions; packages/jobs resolve-seller-identities.ts -->
