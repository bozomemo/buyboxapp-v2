---
id: settings-database
title: Veritabanı
section: screens
order: 50
module: null
routes:
  - /settings/database
---

**Veritabanı** sekmesi, uygulamanın kullandığı veritabanının durumunu gösterir. Yalnızca bilgi verir; bu ekranda değiştirilebilecek bir ayar veya düğme yoktur. Bir güncellemeden sonra ya da kurulumu yapan kişi sizden bilgi istediğinde bu ekrana bakarsınız.

## Veritabanı Durumu

- **Motor**: veritabanının türü (ör. SQLite, PostgreSQL veya MySQL).
- **Bağlantı**: veritabanının adresi. Parola gibi gizli bilgiler gösterilmez.
- **Şema Sürümü**: "… / … göç uygulandı" biçiminde, veritabanı yapısının kaç güncellemesinin uygulandığını gösterir. Yanındaki etiket:
  - **güncel**: veritabanı yapısı uygulamanın bu sürümüyle uyumlu. Normal durum budur.
  - **güncel değil**: veritabanı yapısı uygulamanın beklediğinden eski. Bazı ekranlar veya işler hata verebilir.

Ekranı tüm roller görebilir.

## Sık sorulanlar

**Şema Sürümü "güncel değil" gösteriyor. Ne yapmalıyım?**
Bu ekrandan düzeltilemez. Kurulumu yapan kişiye başvurun ve ekrandaki "… / … göç uygulandı" bilgisini iletin.

**Veritabanını değiştirmek veya taşımak istiyorum.**
Bu işlem kurulum sırasında yapılır ve sunucuda işlem gerektirir. Kurulumu yapan kişiye başvurun.

**Veritabanı yedeği nasıl alınır?**
Yedekleme bu ekrandan yapılmaz. Kurulumu yapan kişiye başvurun.

<!-- kaynak: doc 18 §8.2, doc 06 §9, doc 15 §6; apps/web/src/app/settings/database/page.tsx, settings/database/database-client.tsx, app/api/settings/database/route.ts -->
