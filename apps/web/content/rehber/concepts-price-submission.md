---
id: concepts-price-submission
title: Fiyat Gönderimi ve İlan Otomasyonu
section: concepts
order: 6
module: seller
routes: []
---

Satış modülünde, tüm işleri durduran [Genel Durdurma](/rehber/concepts-automation-and-stop)dan ayrı olarak, yalnızca fiyatların pazaryerine gönderilmesini durduran anahtarlar ve her ilanın kendi otomasyon anahtarı vardır.

## Fiyat gönderimi (tüm pazaryerleri)

**Panel**'deki **Güvenlik Anahtarları** bölümünde bulunur: **Fiyat gönderimini durdur** / **Fiyat gönderimini aç**.

- Kapalıyken uygulama çalışmaya devam eder: ilanları içe aktarır, buybox'ı izler, fiyatları **hesaplar**, ama hiçbir fiyatı pazaryerine **göndermez**.
- Yeni kurulumda ve otomasyonu ilk kez denerken bunu kapalı tutup hesaplanan fiyatları incelemenizi öneririz.

## Pazaryeri bazında gönderim

**Panel**'deki **Pazaryerleri** bölümünde her pazaryerinin yanında **Gönderim açık** / **Gönderim durduruldu** etiketi ve **Durdur** / **Aç** düğmesi bulunur. Yalnızca o pazaryerine giden fiyatları durdurur.

Ne zaman: Sorun tek bir pazaryerindeyse (ör. Hepsiburada fiyatları reddediyor) diğerini etkilemeden.

## İlan bazında otomasyon

Durdurma düğmelerinden ayrı olarak, her ilanın kendi otomasyon anahtarı vardır:

- **İlanlar** ekranında satırdaki anahtarla ya da birden çok ilanı seçip **Otomasyonu Aç** / **Otomasyonu Kapat / Hariç Tut** ile.
- İlan ayrıntısında **Otomasyonu Duraklat** / **Otomasyonu Sürdür** ile.

Otomasyonu kapalı bir ilan için fiyat hesaplanmaz ve gönderilmez. Karar açıklamasında _Bu ilan için fiyatlama kapalı_ yazar.

## Kim ne yapabilir

Durdurmak ve yeniden açmak **Yönetici** ve **Fiyat Yöneticisi** rollerine açıktır. Durdurmak hiçbir zaman para kaybettirmez; açmak fiyatları yeniden pazaryerine gönderir. **İzleyici** hiçbirini yapamaz.

## Sık sorulanlar

**Yeni kurulumda fiyat gönderimi açık mı?**
Hayır. Güvenlik için kapalı başlar; hesaplanan fiyatları inceledikten sonra siz açarsınız. Bkz. [İlk Adımlar: Satış Modülü](/rehber/start-seller).

**Fiyat gönderimi kapalıyken elle fiyat girersem gider mi?**
Hayır. Elle girilen fiyatlar da aynı gönderim yolunu kullanır; gönderim kapalıyken bekler.

<!-- kaynak: doc 06 §2; doc 18 §6.1, §6.2; apps/web/src/app/dashboard-client.tsx Güvenlik Anahtarları / Pazaryerleri, listings/listings-client.tsx, listings/[id]/listing-detail-client.tsx -->
