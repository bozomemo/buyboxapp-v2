---
id: concepts-automation-and-stop
title: Otomasyon ve Durdurma
section: concepts
order: 5
module: null
routes: []
---

Uygulamada işleri ve fiyat gönderimini durdurmak için birbirinden bağımsız üç düzey vardır. Bir sorun gördüğünüzde hangisini kullanacağınızı bilmek önemlidir.

## 1. Genel Durdurma (tüm sistem)

Her ekranın sağ üstündeki düğme. Normalde **Sistem Çalışıyor** yazar.

- Tıkladığınızda **tüm işler** durur: içe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi. Marka modülünün taramaları da durur.
- Düğme **Genel Durdurma: Duraklatıldı** olarak değişir.
- Yeniden başlatmak için aynı düğmeye tıklayın; uygulama onay ister, çünkü tüm işler yeniden başlar.

Ne zaman: Bir şeylerin ters gittiğinden şüphelendiğinizde, nedenini anlayana kadar her şeyi durdurmak için. Tek tıkla, her ekrandan.

> **Yeni kurulum duraklatılmış başlar.** Güvenlik için yeni bir kurulumda hiçbir iş çalışmaz; ayarlarınızı tamamladıktan sonra **Genel Durdurma: Duraklatıldı** düğmesine tıklayıp sistemi siz başlatırsınız. Fiyat gönderimi de kapalı başlar ve ayrıca açılması gerekir.

## 2. Fiyat gönderimi (tüm pazaryerleri) — satış modülü

**Panel**'deki **Güvenlik Anahtarları** bölümünde bulunur: **Fiyat gönderimini durdur** / **Fiyat gönderimini aç**.

- Kapalıyken uygulama çalışmaya devam eder: ilanları içe aktarır, buybox'ı izler, fiyatları **hesaplar**, ama hiçbir fiyatı pazaryerine **göndermez**.
- Yeni kurulumda ve otomasyonu ilk kez denerken bunu kapalı tutup hesaplanan fiyatları incelemenizi öneririz.

## 3. Pazaryeri bazında gönderim — satış modülü

**Panel**'deki **Pazaryerleri** bölümünde her pazaryerinin yanında **Gönderim açık** / **Gönderim durduruldu** etiketi ve **Durdur** / **Aç** düğmesi bulunur. Yalnızca o pazaryerine giden fiyatları durdurur.

Ne zaman: Sorun tek bir pazaryerindeyse (ör. Hepsiburada fiyatları reddediyor) diğerini etkilemeden.

## İlan bazında otomasyon — satış modülü

Durdurma düğmelerinden ayrı olarak, her ilanın kendi otomasyon anahtarı vardır:

- **İlanlar** ekranında satırdaki anahtarla ya da birden çok ilanı seçip **Otomasyonu Aç** / **Otomasyonu Kapat / Hariç Tut** ile.
- İlan ayrıntısında **Otomasyonu Duraklat** / **Otomasyonu Sürdür** ile.

Otomasyonu kapalı bir ilan için fiyat hesaplanmaz ve gönderilmez. Karar açıklamasında _Bu ilan için fiyatlama kapalı_ yazar.

## Kim ne yapabilir

- **Durdurmak** (genel durdurma, fiyat gönderimi, pazaryeri gönderimi): **Yönetici** ve **Fiyat Yöneticisi**.
- **Yeniden açmak** da aynı iki role açıktır. Durdurmak ve açmak ayrı yetkilerdir: durdurmak hiçbir zaman para kaybettirmez, açmak ise fiyatları yeniden pazaryerine gönderir.
- **İzleyici** hiçbirini yapamaz; düğmeler onun için pasif görünür.

## Sık sorulanlar

**Genel durdurmayı açtım, pazaryerindeki fiyatlarım geri alınır mı?**
Hayır. Durdurma yalnızca bundan sonrasını etkiler; pazaryerindeki mevcut fiyatlar olduğu gibi kalır.

**Fiyat gönderimi kapalıyken elle fiyat girersem gider mi?**
Hayır. Elle girilen fiyatlar da aynı gönderim yolunu kullanır; gönderim kapalıyken bekler.

**Düğme gri, tıklayamıyorum.**
Rolünüz bu işleme izin vermiyor. Bir yöneticiye başvurun.

<!-- kaynak: doc 06 §2; doc 18 §6.1, §6.2; apps/web/src/app/nav-shell.tsx SystemPauseButton, dashboard-client.tsx Güvenlik Anahtarları / Pazaryerleri, listings/listings-client.tsx, listings/[id]/listing-detail-client.tsx -->
