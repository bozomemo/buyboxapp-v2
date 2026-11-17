---
id: troubleshooting-seller
title: Sorun Giderme: Fiyatlar
section: troubleshooting
order: 2
module: seller
routes: []
---

Satış modülünde fiyatlarla ilgili sorunlar. Önce **Panel → Dikkat Gerekenler** bölümüne bakın. Genel sorunlar için bkz. [Sorun Giderme](/rehber/troubleshooting).

## Fiyatlar pazaryerine gitmiyor

1. **Fiyat gönderimi kapalı.** **Panel → Güvenlik Anahtarları**'nda **Fiyat gönderimi: kapalı** yazıyorsa uygulama fiyatları hesaplar ama göndermez. Yeni kurulumda kapalı başlar.
2. **Pazaryeri için gönderim durdurulmuş.** **Panel → Pazaryerleri**'nde o pazaryerinin yanında **Gönderim durduruldu** yazıyorsa **Aç**'a tıklayın.
3. **Devre kesici açık.** Bir pazaryeri art arda hata verirse uygulama o pazaryerine gönderimi kendiliğinden keser. **İşler** ekranındaki **Devre Kesici (Circuit Breaker)** bölümünde **Açık (devre dışı)** ve son hata yazar. Hatanın nedenini giderin (çoğu zaman pazaryeri bağlantı bilgileri), sonra **Sıfırla**'ya tıklayın.
4. **Günlük güncelleme bütçesi doldu.** Karar açıklamasında _Günlük güncelleme bütçesi doldu_ yazar. Ertesi gün kendiliğinden devam eder.
5. **İlanın otomasyonu kapalı.** Bkz. [Fiyatım değişmiyor](#fiyatim-degismiyor).

## Fiyatım değişmiyor

**İlanlar** ekranında ilanı açın ve son karar açıklamasına bakın. Neden orada yazar:

| Açıklama | Ne yapmalı |
|---|---|
| _En iyi fiyatta tutuluyor_ | Sorun yok. Buybox sizde ve en kârlı fiyattasınız. |
| _Piyasa taban fiyatımızın altında — beklemede_ | Rakip, zarar etmeden inebileceğiniz fiyatın altında. Maliyetinizi ve ücretlerinizi kontrol edin; doğruysa beklenen davranıştır. |
| _Bu ilan için fiyatlama kapalı_ | İlanın otomasyonu kapalı, ilan satışta değil ya da stok kuralına takılıyor. |
| _Maliyet hesaplanamadı_ | **Stok** ekranında bu ürünün maliyetini girin. |
| _Yeterli buybox verisi yok_ | Buybox bilgisi henüz gelmedi ya da eski. Sistem duraklatılmış veya bir iş başarısız olabilir; **İşler** ekranına bakın. |
| _Önceki gönderimin onayı bekleniyor_ / _Piyasanın oturması bekleniyor_ | Son değişikliğin sonucu bekleniyor. Birkaç dakika içinde kendiliğinden ilerler. |
| _Ayarlanan üst sınır taban fiyatın altında_ | İlanın **Min/Max** değerindeki üst sınır, taban fiyatın altında. Düzeltin. |
| _Pazaryerinin izin verdiği aralık dışında_ | Pazaryeri bu fiyatı kabul etmedi. Pazaryerindeki fiyat sınırlarını kontrol edin. |

Bkz. [Fiyat Nasıl Belirlenir](/rehber/concepts-repricing).

## Fiyat beklenmedik şekilde yüksek veya düşük

1. **Maliyet yanlış.** En sık neden budur. **Stok** ekranında ürünün **Birim Fiyat (₺, KDV dahil)** değerini kontrol edin. KDV hariç girilmiş bir maliyet taban fiyatı düşük gösterir.
2. **Ücret ayarları yanlış.** **Ayarlar → Ücretler**'de kargo ve gider bantlarını kontrol edin.
3. **Adet veya paket hatası.** Çoklu satılan bir ilanda adet sayısı ya da paket bileşenleri yanlış olabilir.
4. **Tek satıcısınız.** Rakip yoksa fiyat hedef kâr oranına göre belirlenir; **Ayarlar → Politika**'yı kontrol edin.

Acil durumda sağ üstteki düğmeyle sistemi durdurun; pazaryerindeki fiyatlar olduğu gibi kalır, yalnızca yeni değişiklik yapılmaz.

<!-- kaynak: moved from troubleshooting.md; see its sources -->
