# End-to-end walkthrough — 2026-11-19

Branch `fix/e2e-walkthrough`, cut from `development` at `42a425f`. Every fix found here is a
separate commit on this branch so any of them can be dropped.

## Setup

- Checkout build (`next build` + `next start`) on `http://localhost:3100`, Node 22.23.4 (the one the
  installer ships; the machine's Node 22.3.0 segfaults in better-sqlite3).
- Fresh SQLite database in the checkout; the installed `BuyBoxApp` service and
  `C:\ProgramData\BuyBox` are not touched.
- Licence: local 30-day trial issued with `scripts/issue-license.mjs`.

## Ground rules held during the run

- No real marketplace credential is entered. Marketplace connection tests use dummy values and are
  expected to fail with an auth error; that failure path is what gets tested.
- No worker runs beside `next start` (Panel: "Worker: durmuş"), and price submission stays off,
  so no queued job reaches Trendyol or Hepsiburada and no competitor page is fetched.

## Defects

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

## Questions for the product owner (not changed)

- **Cargo bands with no open-ended last band.** With one cargo band "≤ 150 ₺ → 39,99" the floor
  preview for a 100 ₺ cost is 170,58 — above 150, so no band matches, and the last band's amount
  is used anyway. Doc 02 §3 does not say whether the last band must be open-ended. Either the form
  should require it or the engine's fallback should be documented.
- **Saving marketplace credentials that failed their test.** The wizard saves them and says
  "Kimlik bilgileri şifreli olarak kaydedildi." under the red test failure. Intended?

## Checked and working

- Bootstrap: token step, username/password validation (server messages are clear), admin
  creation, redirect back to the wizard.
- Wizard: DB test + migrate, purpose (both modules), store name, marketplace field validation,
  fees save + floor preview, policy save (automation off), product source save, ERP skip, finish.

