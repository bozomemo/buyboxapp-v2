---
id: guide
title: Rehberi Kullanma
section: screens
order: 57
module: null
routes:
  - /rehber
  - /rehber/[id]
---

**Kullanım Rehberi**, uygulamanın her ekranını, temel kavramları, sık sorulan soruları ve sorun giderme adımlarını anlatır. Menüde **Sistem** grubundaki **Rehber** ile açılır. Tüm roller rehberi okuyabilir.

## Ekranın rehberini açmak

Her ekranın üst çubuğunda bir **?** işareti vardır (**Bu ekranın rehberi**). Tıklayınca o an bulunduğunuz ekranı anlatan bölüm açılır. Ekranın kendi bölümü yoksa rehberin ana sayfası açılır.

## Arama

Ana sayfadaki **Rehberde ara…** kutusuna bir kelime yazın (ör. "taban fiyat", "şifre", "rakip"). Sonuçlar yazdıkça listelenir: başlığında geçenler önce, sonra ara başlıklarda, sonra metinde geçenler gelir. Büyük-küçük harf ve Türkçe karakterler fark etmez; "ilan" yazınca "İlanlar" da bulunur. Bazı kelimeler eş anlamlısıyla birlikte aranır: "şifre" yazınca "parola" geçen konular, "dip fiyat" yazınca "taban fiyat" geçen konular da bulunur. Sonuç yoksa başka bir kelime deneyin ya da **Sık Sorulanlar** ve **Sorun Giderme** bölümlerine bakın.

## Bölümler

Konular şu bölümlerde sıralanır:

- **Başlangıç**: yeni kurulumdan günlük kullanıma geçiş. Bkz. [Kurulumdan Sonra İlk Adımlar](/rehber/start).
- **Temel Kavramlar**: taban fiyat, buybox, maliyet ve ücretler, fiyatın nasıl belirlendiği, otomasyon ve durdurma, roller, rakip verisi.
- **Ekranlar**: her ekran için bir bölüm.
- **Sık Sorulanlar**: genel sorular. Bkz. [Sık Sorulanlar](/rehber/faq).
- **Sorun Giderme**: belirti, olası neden ve nereye bakılacağı. Bkz. [Sorun Giderme](/rehber/troubleshooting).
- **Sözlük**: terimlerin kısa açıklamaları. Bkz. [Sözlük](/rehber/glossary).

Bir konu açıkken, geniş ekranda solda tüm konuların listesi görünür. Sayfanın başındaki **Bu sayfada** kutusu, konunun ara başlıklarına atlamanızı sağlar.

## Neden bazı konular görünmüyor?

Rehber yalnızca bu kurulumda açık olan modüllerin konularını gösterir. Örneğin marka modülü kapalıysa marka ekranlarının bölümleri listelenmez ve onlara verilen bağlantılar düz metin olarak görünür. Modüller için bkz. [Modüller](/rehber/settings-modules).

Rehber rolünüze göre süzülmez: rolünüzün yapamadığı işlemler de anlatılır ve her bölüm hangi rollerin o işlemi yapabileceğini söyler.

## Sık sorulanlar

**Aradığım cevabı bulamadım.**
Önce [Sorun Giderme](/rehber/troubleshooting) bölümüne bakın. Orada da yoksa yöneticinize ya da kurulumu yapan kişiye başvurun.

**Rehberde anlatılan bir düğme bende yok.**
Büyük olasılıkla rolünüzün o işleme yetkisi yoktur. Bölümde hangi rollerin yapabileceği yazar. Bkz. [Roller ve Yetkiler](/rehber/concepts-roles).

<!-- kaynak: doc 19 §2.1, §5, §6; apps/web/src/app/rehber/page.tsx, rehber/guide-client.tsx, rehber/[id]/page.tsx, app/nav-shell.tsx, lib/guide/topic.ts -->
