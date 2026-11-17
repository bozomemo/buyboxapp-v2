---
id: concepts-repricing
title: Fiyat Nasıl Belirlenir
section: concepts
order: 4
module: seller
routes: []
---

Satış modülü her ilan için tek bir şeyi arar: **buybox'ı hâlâ elinizde tutan en yüksek fiyat.** Bunu kademeli olarak bulur ve bulduktan sonra piyasa değişene kadar o fiyatta durur.

## Fazlar

Her ilan şu fazlardan birindedir. **İlanlar** ekranında ve ilan ayrıntısında görünür:

| Faz | Ne demek |
|---|---|
| **Arıyor** | Buybox sizde değil; buybox'ı almak için fiyat düşürülüyor. |
| **Tırmanıyor** | Buybox sizde; kaybetmeden kâr için fiyat adım adım yükseltiliyor. |
| **İnceltiyor** | Yükselirken buybox kaybedildi; doğru nokta iki fiyat arasında, ince ayar yapılıyor. |
| **Optimum** | En kârlı fiyat bulundu; piyasa değişene kadar fiyat değiştirilmiyor. |
| **Bloke** | Rakip, taban fiyatınızın altında; kârlı bir fiyat mümkün değil, fiyat taban fiyatta tutuluyor. |

Rakip yoksa (tek satıcıysanız) fiyat, **Ayarlar → Politika**'daki hedef kâr oranına göre belirlenir.

## Bir ilan neden fiyatlanmaz

Uygulama her ilan için sırayla şu kontrolleri yapar. İlk takıldığı yerde durur ve nedenini karar açıklamasına yazar:

1. **Bu ilan için fiyatlama kapalı** — ilanın otomasyonu kapalı, ilan satışta değil ya da stok kuralı nedeniyle hariç.
2. **Maliyet hesaplanamadı** — stok kaleminde maliyet yok veya 0.
3. **Önceki gönderimin onayı bekleniyor** — son gönderilen fiyat henüz pazaryerinde görünmedi.
4. **Piyasanın oturması bekleniyor** — fiyat yeni değişti; sonuç görülmeden yeni bir değişiklik yapılmaz.
5. **Yeterli buybox verisi yok** — ilanın buybox bilgisi yok ya da çok eski.

Bunları geçen ilanlar için önce [taban fiyat](/rehber/concepts-floor-price) hesaplanır. Fiyat taban fiyatın altındaysa **önce** taban fiyata çekilir; bu her şeyden önceliklidir.

## Sınırlar

Üretilen her fiyat şu sınırlardan geçer:

- Taban fiyatın altına **asla** inmez.
- İlanın **Min/Max** değerleri varsa onların dışına çıkmaz. Bu sınırlar otomasyonun kaçmasına karşı en iyi güvencenizdir.

## Güncelleme bütçesi

Pazaryerleri bir günde yapılabilecek fiyat güncellemesi sayısını sınırlar. Uygulama bu yüzden en kârlı fiyatı bulduktan sonra gereksiz güncelleme yapmaz. Günlük bütçe dolarsa yeni güncellemeler ertesi güne kalır; karar açıklamasında _Günlük güncelleme bütçesi doldu_ yazar. Kalan bütçeyi **Panel**'deki **Pazaryerleri** bölümünde görebilirsiniz.

## Fiyat gönderimi ve onay

Hesaplanan fiyat yalnızca **fiyat gönderimi açıksa** pazaryerine gönderilir (bkz. [Otomasyon ve Durdurma](/rehber/concepts-automation-and-stop)). Gönderilen fiyat, pazaryeri onaylayıp ilanda görünene kadar "bekliyor" sayılır. Pazaryeri bir fiyatı reddederse (ör. izin verdiği aralığın dışında) karar açıklamasında _Pazaryerinin izin verdiği aralık dışında_ yazar.

## Sık sorulanlar

**Fiyatım uzun süredir değişmiyor. Bir sorun mu var?**
İlan **Optimum** fazındaysa bu beklenen davranıştır. Değilse ilan ayrıntısındaki son karar açıklamasına bakın; neden orada yazar.

**Elle fiyat girersem ne olur?**
Elle girdiğiniz fiyat, otomasyonun fiyatları gibi gönderilir ve kayda _Elle değiştirildi_ olarak geçer. Uygulama sizin fiyatınızı hemen ezmemek için o ilanın otomasyonunu politikadaki bekleme süresi kadar duraklatır. Süre bitince otomasyon yeniden kendi hesabını yapar. Fiyatın kalıcı olarak sabit kalmasını istiyorsanız o ilanın otomasyonunu kapatın.

**Neden rakibin 1 kuruş altına inmedi?**
Rakip taban fiyatınızın altındaysa inmez; ilan **Bloke** fazına geçer. Ya da günlük güncelleme bütçesi dolmuş olabilir.

<!-- kaynak: doc 03 §1, §5, §6, §7, §8; apps/web/src/lib/labels.ts PHASE_LABELS, PHASE_DESCRIPTIONS, DECISION_REASON_LABELS -->
