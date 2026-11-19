Open — layout, not attempted 
| # | Screen / flow | What happened | Severity | Status |
|---|---------------|---------------|----------|--------|
| 1 | Checkout first run: wizard DB step | After the database step on setup-token access the wizard went on to step 2, whose save is refused with "Önce /bootstrap ekranından ilk yöneticiyi oluşturun" and no way there. Spec (doc 18 §8.1) says return to /bootstrap. | Medium (dev checkout only) | Fixed `3b160f0` |
| 2 | Wizard text, several steps | Customer-visible text cites the spec: "(doc 08 R-CFG-4)", "(doc 02 §3)", "(doc 03 §3)", "(doc 10 §6, adım 8)", "doc 12 Faz 9". | Low | Fixed `f43d968` (+ test) |
| 3 | Wizard step 4 / marketplace test | A failed connection test shows the raw adapter error: "Trendyol API 403 on /product/sellers/123456/products/approved?page=0&size=1", "Hepsiburada API 401 on /listings/merchantid/…". No Turkish explanation of what to fix. | Medium | Fixed `fc2f18d` |
| 4 | Wizard step 5 (fees) | "39,99" is refused ("Geçerli bir tutar olmalı (örn. 11.00)"); only a dot decimal is accepted. The policy screen and every display use a comma. | Medium | Fixed `a84c048` |
| 5 | Wizard step 5, floor preview | One sentence mixes two money formats: "100,00 ₺ maliyetli bir ürün için dip fiyat: ₺170,58". | Low | Fixed `a84c048` |
| 6 | Wizard step 7 (product source, Excel) | Column labels show internal field names: "baseStockCode sütun başlığı", "unitCost sütun başlığı", "unitStock sütun başlığı", "name sütun başlığı". | Low | Fixed `6e95b01` |
| 7 | Guide (Rehber) | Says a new install starts paused and must be started from the Genel Durdurma button. Measured: `/api/setup/finish` records "not paused" when the wizard finishes, so the system runs right after setup; what starts off is price submission. Wrong in 6 topics. | Medium (guide is the support channel) | Fixed `f0e8a3a` |
| 8 | Panel after a fresh setup | "Rakip verisi bayat" warning on an install with no listings or tracked products yet. | Low | |
| 9 | Panel | "Son 0 karar", "Son 0 uyarı ve hata kaydı(teknik kayıt …" — zero count wording, missing space before "(". | Low | |
| 10 | Stok → Ürün Ekle | "120,50" as the cost answered `Money: invalid decimal string "120,50"`. Same root cause as #4: every route read operator amounts with the wire parser. | High | Fixed `a84c048` |
| 11 | Stok → … Çarpan | A `type="number"` field: in a dot-decimal browser "1,2" (the guide's own example) saved **12**, i.e. cost and floor ×12. An emptied field saved 0; the route stored any number. | **High (money)** | Fixed `9a3f5fe` |
| 12 | Denetim Bulguları → Eşikler | Same `type="number"` problem: "2,5" became 25, empty became 0. | Medium | Fixed `320e8ea` |
| 13 | Several screens | Code names shown to the customer: `brand-reports.ts`, `competitor_observations`, `scrape_runs`, `settings_audit`, `Reprice`, `ObserveBuybox`, `ScrapeCompetitors`. | Low | Fixed `e11107c`, `320e8ea` (+ test) |
| 14 | Top bar at ~970 px wide | The bar overflows: the theme switch is cut ("Si…") and "Sistem Çalışıyor" wraps. | Low | |
| 15 | Stok → Paket Düzenleyici | A new bundle was saved under `Date.now()` ("1795052444341") with no field for its code, so it could never match the listing carrying "12345-k2" (doc 01 §6); that listing stays "bundle not defined" and out of automation. A refused save was dropped silently; the route stored anything. | **High** | Fixed `c16b446` |
| 16 | Marketplace names | ~20 places showed the code "trendyol"/"hepsiburada" (brand cards, alerts, dashboard, jobs passes and rate table, headers, five table columns, a select). | Low | Fixed `03b5652`, `d6fa2c6` (+ test) |
| 17 | İşler → Kuyruk | Queue states shown raw in English: "ready", "locked", "done", "failed". | Low | Fixed `03b5652` |
| 18 | Rakip Geçmişi filter | Labelled "Satıcı (sellerRef)". | Low | Fixed `4a32bbc` |
| 19 | Ayarlar → Pazaryerleri | The Ortam select always showed "Prod", even for an install saved on Test. Picking "Prod" to go live fired no change and saved nothing: the install stayed on the test host while the screen said production. | **High** | Fixed `ca0e396` |
| 20 | Every editing screen, as İzleyici | Against doc 18 §7.2 ("the UI hides controls the user lacks permission for"), an İzleyici had the stock multiplier, Ürün Ekle, every settings form, alert rules, all brand-module actions and the jobs editors enabled; the server refused each with "Kaydedilemedi (HTTP 403)". | Medium | Fixed `6306b89`, `d6fa2c6` |
| 21 | Rehber search | The box suggests "şifre" but the guide says "parola", so "şifre" missed the password topics. | Medium | Fixed `b0c726d` |
| 22 | Ayarlar → Modüller | The brand module's description lists its screens but leaves out Stok, İlanlar, Alarmlar and Kâr Ayarları under Marka Denetimi. | Low | |
| 23 | Ayarlar → Pazaryerleri | The derived seller id is labelled "Satıcı Referansı (merchantRef)", an internal name. | Low | |

## Product owner's decisions (2026-11-19) and what was done

| # | Question | Decision | Done |
|---|----------|----------|------|
| Q1 | Must the last cargo band be open-ended? | Yes | `d6e4246`: the save is refused otherwise, with a sentence; doc 02 §3 records the rule. `50d166c`: the settings screen shows the reason. |
| Q2 | Save credentials that failed their test? | No | `0eda61f`: both save routes run the connection test when the credentials change and refuse a failure; switching a marketplace on/off never calls it. The wizard's save also stopped overwriting stored fields with blanks. |
| Q3 | Leave dormant seller-policy rules undeletable? | No | `69c3ef1`: "Etkisiz kurallar (N)" lists them with "Kuralı sil". |
| Q4 | Environment variable names on screen | My call: keep, but say who sets them | `bd46d52`: "webhook adresi ayarlanmamış"; "Kurulumu yapan kişi sunucu ayarlarına ekler (ALERTS_WEBHOOK_URL)". |
| Q5 | Automation confirm text while submission is off | My call | `e49d9d9`: "hesaplanacak ve Panel'de fiyat gönderimi açıksa pazaryerine gönderilecek". |
| Q6 | "1.400" read differently by the two modules | Every price is TL app-wide | `4ed4f47`: one reading ("1.400" = 1 400 ₺, "1.234,56", "39.99", "₺"/"TL" ignored) for every typed price; prefilled and reloaded amounts shown as "11,00", "1.500,00"; fee band labels name ₺. |

Found while doing these: a successful Trendyol test said "Connected as seller …" in English
(`0eda61f`); the settings marketplace form fell back to "Prod" after a save (`0eda61f`); an
unreadable amount on six routes answered 500 (`50d166c`).

## Checked and working

- Bootstrap: token step, username/password validation (server messages are clear), admin
  creation, redirect back to the wizard.
- Wizard: DB test + migrate, purpose (both modules), store name, marketplace field validation,
  fees save + floor preview, policy save (automation off), product source save, ERP skip, finish.
- Stock: add item ("120,50"), multiplier ("1,2" saved as 1.2, checked after reload), Oto BB,
  bundle create.
- Alerts: create rule ("400,50" shown as ₺400,50), deactivate, delete with confirmation.
- Brand module: product add (barcode checksum warning), card link (multiplier required), profit
  settings save, watched group + brand add, "Şimdi tara" (confirm + queued notice), seller-policy
  rule add, cross-marketplace, comparison, findings.
- Settings: policy "Sabit tutar" 2,50 saved and reloaded, automation on (confirm) / off, notification
  recipients (invalid address refused), modules off (screens redirect) / on, retention, database.
- Users: Fiyat Yöneticisi and İzleyici created; İzleyici forced to change the temporary password;
  wrong password refused; İzleyici sees every editing control disabled after #20.
- Account: TOTP enrolment, recovery codes, sign-in with TOTP (a wrong code refused and logged).
- Panel: Genel Durdurma (stop one click, resume confirmed), price submission (open confirmed, stop
  one click), per-marketplace stop/open.
- Rehber: index (55 topics), search, topic page, all 57 links on a topic resolve, "?" link.
- Events and sign-in activity log.

## Not covered

- Anything that needs a real marketplace account: import, buybox observation, repricing, price
  submission, listing detail and manual price. No credentials were entered and no worker ran.
- Excel uploads (the browser pane cannot pick a file).
- The Fiyat Yöneticisi role was created but not signed in as; its controls follow the same
  PermissionFieldset check that was verified for the İzleyici.
- SMS and e-mail delivery (no provider configured).

