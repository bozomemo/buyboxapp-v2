---
id: concepts-competitor-data
title: Rakip Verisi
section: concepts
order: 7
module: null
routes: []
---

Uygulama, ürünlerinizi satan diğer satıcıları ve fiyatlarını düzenli aralıklarla toplar. Bu bilgi pazaryerlerinin herkese açık ürün sayfalarından alınır ve **yalnızca raporlama içindir**.

## Fiyat kararlarını etkilemez

Satış modülünün fiyat kararları pazaryerinin kendi verdiği **buybox bilgisine** dayanır. Rakip verisi bu kararlara girmez. Bu bilinçli bir tercihtir:

- Herkese açık sayfalar haber vermeden değişebilir ya da geçici olarak erişilemez olabilir.
- Rakip verisi alınamadığında fiyatlama durmaz; yalnızca raporlarda o dönem için boşluk kalır.

## Nerede görünür

- **Satış modülü:** **Rakip Geçmişi**, **Rakip Satıcılar** ve **Alarmlar** ekranları. Bkz. [Rakip Geçmişi](/rehber/competitors).
- **Marka modülü:** **Takip Edilen Ürünler**, **Marka Satıcıları**, **Denetim Bulguları** ve ilgili raporlar. Bkz. [Takip Edilen Ürünler](/rehber/tracked-products).
- **Panel**: rakip verisi bir süredir yenilenmediyse _Rakip verisi bayat_ uyarısı çıkar.

## Neden bazen eksik veya gecikmeli

- Toplama, pazaryerini yormamak için sınırlı bir hızla yapılır; çok sayıda ürün varsa bir turun tamamlanması zaman alır.
- Pazaryeri bir sayfayı geçici olarak engellerse o tur kaydedilir ve sonraki turda yeniden denenir.
- Bazı bilgiler (ör. rakibin kargoya verme süresi) sayfada güvenilir şekilde bulunmadığında **boş** bırakılır; uygulama tahmin yürütmez.

## Sık sorulanlar

**Rakip listesinde bir satıcı görünüyor ama pazaryerinde yok.**
Liste son başarılı toplamaya göredir. Satıcı o tarihten sonra çıkmış olabilir; ekrandaki zaman bilgisine bakın.

**Rakip verisi alınamazsa fiyatlarım etkilenir mi?**
Hayır. Fiyat kararları rakip verisine bağlı değildir.

<!-- kaynak: CLAUDE.md "competitor sources (reporting only)"; doc 06 §6, §12; apps/web/src/app/dashboard-client.tsx 'Rakip verisi bayat' -->
