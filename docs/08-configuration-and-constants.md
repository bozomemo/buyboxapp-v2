# 08 — Configuration & Constants

A complete inventory of every tunable value in the system, where it currently lives, and what
it must become. **Everything marked "hardcoded" is a `const`/`static readonly` in C# source or
a literal inside a SQL function.**

## 1. Where configuration lives today

| Location | Contents |
|----------|----------|
| `App.config` → `userSettings` | MySQL connection string (**with password in plain text**) |
| `App.config` → `applicationSettings` | N11 SOAP endpoint URLs |
| `App.config` → `system.serviceModel` | GittiGidiyor WCF endpoints (dev host) |
| C# `static` fields with `// TODO : Make these unhardcoded` | credentials, store names, cargo prices, thresholds, step sizes, paging limits |
| MySQL `marketplacesettings` table | a full, unused, per-marketplace settings model |
| Not configurable at all | polling intervals, batch sizes, timeouts, retry policy |

## 2. Credentials (all hardcoded — must be rotated and externalised)

| Item | Where | Notes |
|------|-------|-------|
| Trendyol API key / secret / supplier id | `WebClasses/APIOperations.cs` | placeholder-redacted in the file (`its_secret`) — real values are elsewhere or were removed |
| Hepsiburada store username, password, merchant id | `MarketPlaces/HepsiBurada.cs` `ImportSettings()` | **live values present in source** |
| Farmazon username, password, clientName, clientSecretKey | `MarketPlaces/Farmazon.cs` | placeholder-redacted |
| N11 appKey / appSecret | `MarketPlaces/N11.cs` | **live values present in source** |
| GittiGidiyor apiKey / secretKey / roleName / rolePassword | `MarketPlaces/GittiGidiyor.cs` | **live values present in source** |
| MySQL `buyboxapp` user + password | `App.config` | **live value present** |
| MySQL ERP `teyentegrasyon` user + password | `Database/SQLFunctions.cs` `RefreshBundleTable()` | **live value present, second hardcoded connection string** |

**Action required before this repository is shared: rotate all of the above.**

## 3. Store identity

| Setting | Value | Where |
|---------|-------|-------|
| Trendyol store name | `farmaucuz` | `MainWindow`, `TYAutoBB` — **duplicated in two places** |
| Hepsiburada store name | `FARMAUCUZ` | `HBAutoBB` |
| Hepsiburada store name (SQL) | `marketplacesettings.MarketPlaceStoreName` for `'HB'` | used by `SFGETHBINBUYBOX` |

Three sources of truth for one fact, in two different cases. A mismatch silently means
"we are never in the buybox".

## 4. Trendyol pricing constants

| Name | Value | Meaning |
|------|-------|---------|
| `cargoPrice1` | 11.00 | cargo, top band |
| `cargoThreshold1` | 75 | band edge |
| `cargoPrice2` | 9.00 | |
| `cargoThreshold2` | 30 | |
| `cargoPrice3` | 4.76 | |
| `cargoThreshold3` | 20 | |
| `cargoPrice4` | 4.76 | identical to `cargoPrice3` |
| `price_change_rate_default` | 0.10 | fine step |
| `default_threshold_value` | 1 | fine/medium boundary |
| `price_change_rate_less_scnd` | 1.00 | medium step |
| `scnd_threshold_value` | 5 | medium/coarse boundary |
| `price_change_rate_more_scnd_threshold` | 4.00 | coarse step |
| `only_seller_price_multiplier` | 1.20 | target margin when we are the sole seller |
| `low_stock_if_sell_multiplier` | 1.10 | extra margin required when the buybox holder is low on stock |
| `lowest_stock_limit` | 5 | "low on stock" definition |
| `unit_stock_threshold` | 1 | minimum physical stock to consider a listing |
| Damping rule | `buyboxPrice < 30 && ourPrice > 34.6 → −0.1` | inlined four times |
| Default commission fallback | 16.0 | used when `BeforeChangeCommissionRate` is NULL |

## 5. Hepsiburada pricing constants (C#)

| Name | Value |
|------|-------|
| `firstCargoPrice` | 4.71 |
| `secondCargoPrice` | 9.43 |
| `thirdCargoPrice` | 12.08 |
| cargo band edges | 30 and 100 |
| `marketingExpenditure` | 1.18 |
| `marketingExpenditureLimit` | 50 |
| `minPriceChangeRate` | 0.20 |
| `commissionRateVat` | 1.18 |
| `priceChangeListCapacity` | 5 |
| Floor-calculation ladder | 99.99 / 49.99 / 29.99 (in the unused C# floor method) |
| Default commission fallback | 16.0 (× 1.18 in SQL) |

## 6. Hepsiburada pricing constants (SQL, `marketplacesettings` where `MarketPlaceCode='HB'`)

`CargoPrice1..5`, `CargoPriceThreshold1..5`, `Expenditure1..5`, `ExpenditureThreshold1..5`,
`CommissionRateVat`, `PriceChangeRate`, plus `MarketPlaceStoreName`, `StoreUserName`,
`Password`, `MerchantId`, `PagingLimit`, `AutoBbActive`, `AutoStockActive`,
`AutoListingInterval`, `SuggestedStockMultiplier`, `BuyboxPriceRange`,
`OnlySellerProfitPercentage`.

**The C# and SQL constant sets describe the same quantities with different values and
different band structures.** Reconciling them is a prerequisite for the rewrite; the operator
must confirm the correct current figures against real settlement statements, because cargo
tariffs, commission rates and the VAT rate have all changed since 2024 (notably, the `1.18`
VAT multiplier reflects an 18% rate that is now 20% in Turkey).

## 7. Integration constants

| Name | Value | Where |
|------|-------|-------|
| Hepsiburada paging limit | 100 | `HepsiBurada.ImportSettings` |
| Hepsiburada buybox SKUs per call | 10 | `MainWindow.buyboxOrderMaxCount`, and a literal `10` in `GetListings` |
| Hepsiburada marketplace code / name | `HB` / `Hepsiburada` | `HepsiBurada.ImportSettings` |
| Pending-approval state id / label | `1` / `Onay Bekleniyor.` | `HepsiBurada.ImportSettings` |
| Trendyol items per price update | 1 (limit is 100) | `APIOperations` |
| Farmazon page size | 100 | `Farmazon.ImportSettings` |
| Farmazon order state | 2 | `Farmazon.ImportSettings` |
| Farmazon listing states | active = 1, passive = 2 | `Farmazon` |
| N11 page size | 100 | `N11.ImportSettings` |
| GittiGidiyor row count | 100 | `GittiGidiyor.ImportSettings` |
| SQL command timeout (stock table fill) | 99999 | `SQLFunctions.Fill_Stock_Table` |
| HTTP timeouts | none set — framework defaults | everywhere |

## 8. Hardcoded file paths (broken)

| Path | Where |
|------|-------|
| `D:\Farmaucuz Files\Yazılım\Logs.txt` | `FileFunctions.WriteLog` |
| `C:\Users\Mehmet\Desktop\Farmaucuz Files\Yazılım\PossibleBuybox.txt` | `FileFunctions.WritePossibleBuybox` |
| `c:\` | initial directory of every file dialog |

The first two are developer-machine paths; both methods are currently unused.

## 9. Excel contract constants

| Constant | Value |
|----------|-------|
| Product worksheet name | `Ürünler` (exact match required) |
| Product columns | index 1 = barcode, index 2 = commission (positional) |
| Stock columns | `KODU`, `ADI`, `Standart_Maliyet`, `TOPLAM MIKTAR` (by name) |
| Stock sheet selection | first sheet whose name does not contain `FilterDatabase` |
| OLE DB provider | `Microsoft.ACE.OLEDB.12.0`, `Excel 12.0 Xml;HDR=YES` |
| EPPlus licence context | `NonCommercial` — **incorrect for commercial use, a licensing risk** |

## 10. Magic sentinel values

These are load-bearing. Any rewrite must replace them with explicit optional/error types.

| Sentinel | Meaning | Where |
|----------|---------|-------|
| `999` | unit price unknown / bundle undefined | `getUnitPrice`, `SFGETUNITPRICE` |
| `−1` | stock unknown, price unknown, no competitor, no rating, not in top five | almost everywhere |
| `"Error"` as a product title | the Trendyol API call failed | `APIOperations.getProductCard` |
| `"No Seller"` | no buybox seller | scraper and DB writes |
| `"< ? >"` | no competitor data (string form) | SQL functions, parsed back by the engine |
| `"?"` | no dispatch time | `SFGETHBMERCHANTDISPATCHTIME` |
| `"123456789"` | base stock code could not be parsed | `Functions.getBaseStockCode` |
| `16.0` | commission unknown | two places |
| `1.0` | basket ratio when no campaign | SQL |
| `0` | store debt when no campaign | SQL |

## 11. Target configuration model

The rewrite should have exactly **three** configuration layers:

1. **Secrets** — marketplace credentials, database credentials. Held in a secret store
   (environment variables at minimum; a managed secret manager preferably). Never in source,
   never in a database column, never in a config file committed to version control.
2. **Marketplace commercial parameters** — per marketplace, versioned with effective dates,
   because they change and historical audit rows must remain interpretable:
   - commission VAT multiplier
   - cargo price bands `[{ maxPrice, price }]`
   - expenditure bands `[{ minPrice, amount }]`
   - default commission rate
   - store identity (merchant id preferred over name)
3. **Engine policy** — per marketplace, editable by the operator in the UI:
   - price step ladder `[{ maxGap, step }]`
   - sole-seller margin multiplier
   - low-stock competitor threshold and margin multiplier
   - minimum physical stock to trade
   - absolute price floor/ceiling per listing (`MinimumPrice`/`MaximumPrice` — the unimplemented
     columns already in the schema)
   - polling interval and concurrency limit
   - global and per-marketplace kill switches

Requirements:

| ID | Requirement |
|----|-------------|
| **R-CFG-1** | No credential may appear in source, in a config file under version control, or in a plain-text database column. |
| **R-CFG-2** | Every value listed in §4–§7 must be configurable at runtime without a rebuild. |
| **R-CFG-3** | Commercial parameters must be effective-dated so historical price decisions can be re-explained. |
| **R-CFG-4** | Store identity must have exactly one source of truth per marketplace. |
| **R-CFG-5** | Sentinel values must be replaced by explicit optional/result types; a missing cost must prevent trading, not produce a price. |
| **R-CFG-6** | Configuration changes must be audited (who, when, old value, new value). |

---

## 12. Competitor-source constants (reporting only) — **added 2026-08-13**

These govern `ScrapeCompetitors` (doc 07 §7) and the two competitor sources: Trendyol's public
page (api-references §1.6) and Hepsiburada's public listings endpoint (§2.11). **None of them
derives from a published marketplace figure** — neither source has a documented quota — so they
are deliberately conservative defaults rather than measured limits, and are recorded here so
nobody mistakes them for spec values. This is reporting: being slow costs nothing; being
aggressive risks a block.

| Constant | Default | Where | Why this value |
|----------|---------|-------|----------------|
| `SCRAPER_USER_AGENT` | `BuyBoxApp/1.0 (repricing; reporting-only)` | env (`packages/shared` bootstrap) | doc 04 §1.5 requires a deliberate user-agent policy. Identifies the client honestly. **Currently unused by either scraper** (see next row) — kept in the schema for a future honest source. |
| `SCRAPER_BROWSER_USER_AGENT` | a current Chrome UA | env (same) | **Trendyol's public scrapers only, since 2026-08-28.** Hepsiburada's listings endpoint was the original reason for this variable — 403 to an honest agent, ablated 2026-08-13 — but answered a bare honest request on 2026-08-28, so its exception was withdrawn and it went back to `SCRAPER_USER_AGENT` (see `HEPSIBURADA_IMPERSONATE_BROWSER` below). Trendyol's bot detection was found to do the same even at a conservative request rate — confirmed 2026-08-17 when the operator's own browser reached the same product page without incident from the same network while the honest agent was blocked — and the product owner authorised the identical reporting-only exception for Trendyol on 2026-08-17 (api-references §1.6). Deployment config so it is visible, and because a UA naming a browser version that no longer exists is itself a bot signal and must be refreshed. |
| requests/minute | 30 | `TRENDYOL_SCRAPE_DEFAULTS` | Well under any plausible threshold; the job has no deadline. |
| burst | 5 | same | A full minute's allowance as burst would defeat the limit. |
| cache TTL | 10 min | same | Variants of one product share a page; doc 07 §7 requires identical requests be cached. |
| request timeout | **30 s** | same | A hung page must not hold a worker slot. **Raised from 15 s on 2026-09-11**: on the operator's production install `page.goto: Timeout 15000ms exceeded` was the single most common recurring entry in the event log, steadily and on ordinary products, while the marketplace was answering normally — a machine that cannot render a heavy SPA to `domcontentloaded` in 15 s, not a source that refuses to answer. A reporting job with no deadline should wait rather than file a failure and spend the slot again next hour. **Operator-overridable** since the same date, stored beside the rate in `scrape.<marketplace>.rateLimit` (see below), because the right value is a property of the operator's machine and link and nothing compiled in can know it. |
| `RETRYABLE_HTTP_STATUSES` | 403, 429, 502, 503, 504 | `TrendyolPublicPageSource` — **widened 2026-09-11** | Which statuses the bounded retry applies to. 403 for the 2026-08-17 per-request fingerprint measurement; the rest because the server itself said "later" — the production log carried ten `Trendyol public page 503`s in four days, scattered across unrelated products at unrelated hours, each ending that product's look for the cycle. **404 and 410 are deliberately absent**: they state the product is *gone*, and retrying spends three tokens to be told so three times. 500 is absent too — an unconditional server error on one product is not known to be transient here. |
| `retryOn403MaxAttempts` | 3 (2 retries) | same | Kept as a cheap, bounded second line of defence even after the transport fix below. The name predates the widening above. |
| `retryOn403BaseMs` | 300 ms, doubling, capped at 5 s | same | Short: when the old flakiness was measured, it resolved on the very next attempt, not after a long wait. |
| HTTP transport | Playwright headless Chromium (`playwright-fetch.ts`) | `TrendyolPublicPageSource`'s default `fetchFn` | **Added 2026-08-17, root cause of the 403s, corrected same day.** First attempt (`node-https-fetch.ts`, Node's core `https` in place of the platform `fetch`) was based on a measurement that turned out not to hold: re-tested live, Node's `https.request` also returned 403 consistently, including with a full realistic browser header set. The actual cause is Cloudflare fingerprinting the **TLS ClientHello**, not the HTTP layer — `fetch` (undici) and Node's core `https` both sit on the same OpenSSL TLS stack and are scored identically; `curl` had only ever succeeded because it happened to run through Windows' Schannel TLS on the diagnostic machine, not something production can rely on. A real headless browser has a real browser TLS/JS fingerprint, which is what Trendyol's bot management actually accepts — confirmed 2026-08-17: 10/10 consecutive previously-failing product pages returned 200. `node-https-fetch.ts` is kept as an injectable alternative (and its own passing tests) but is no longer the default. See `playwright-fetch.ts`'s doc comment for the full record, including a Playwright quirk found along the way: reading a response body via `response.text()` on a page reused for a later navigation made that later navigation's own timeout stop being enforced; the fetcher reads `page.content()` instead. |
| requests/minute | **10** | `HEPSIBURADA_SCRAPE_DEFAULTS` | Stricter than Trendyol for a measured reason: ~8 rapid requests tripped a temporary Akamai block on 2026-08-13 (§2.11). |
| burst | 3 | same | Same measurement. |
| cache TTL | 10 min | same | As Trendyol; several of our listings can share one marketplace SKU. |
| request timeout | 15 s | same | As Trendyol's *original* value. Not raised with it — the 2026-09-11 measurement was on Trendyol's product page, which is a heavy SPA; this is a JSON endpoint, and the operator's timeout override reaches it anyway when one is stored. |
| requests/minute | **6** | `TRENDYOL_IDENTITY_DEFAULTS` — **added 2026-08-28** | Seller-identity resolution (api-references §1.6a). A fifth of the scrape's rate on purpose: this is not a throughput path, it runs when a person presses a button, and the volume is bounded by how many firms someone intends to contact. Deliberately **not** the operator-settable `scrape.<marketplace>.rateLimit` — that number is tuned for a job with thousands of pages to get through, and applying it here would let a screen button inherit a crawl's pace. |
| burst | 2 | same | And the token bucket is not what limits concurrency: resolutions are serialised through a promise chain, because a burst of two would otherwise allow two simultaneous browser page loads. "One at a time" is the property doc 12 Faz 7 asks for. |
| `IDENTITY_MAX_CANDIDATES` | 4 | `packages/jobs/pipeline/resolve-seller-identity.ts` | How many of a seller's recent products to try before giving up. Each attempt is a real page load; a seller absent from four of their most recent products is one this cannot identify today, and walking the catalogue would turn one button press into the crawl api-references §1.6 exists to prevent. |
| `IDENTITY_LOOKBACK_DAYS` | 60 | same | How far back a sighting still counts as a lead. Wide, because a stale candidate costs one `identityMismatch` and moves to the next — and narrow enough that a seller gone for two months is reported as unresolvable rather than probed. |
| identity cache | **none** | `TrendyolSellerIdentitySource` | Unlike the scraper, which caches 10 minutes. The stored `competitor_seller_identities` row *is* the cache and carries a visible date; someone pressing "resolve" again is asking for a fresh answer, and serving them a cached one would silently answer a different question. |
| `HEPSIBURADA_IMPERSONATE_BROWSER` | `0` | env — **added 2026-08-28** | Puts the Hepsiburada listings source back on the 2026-08-13 browser header set. Off, because the endpoint accepts an honest request again (api-references §2.11). The set is kept rather than deleted so that a return of the 403s costs a setting rather than a release; a 403 from that source names this variable in its message. |
| requests/minute | **6** (burst 2) | `HEPSIBURADA_BRAND_CATALOGUE_DEFAULTS` — **added 2026-08-28** | Hepsiburada brand catalogue sweep (api-references §2.13). A fifth of the Trendyol sweep's 30/min: each page is a ~2.3 MB server-rendered document, and a reporting job with no deadline pays nothing for being slow. Operator-overridable through `scrape.hepsiburada.rateLimit`, with its own limiter instance. |
| requests/minute | **4** (burst 2) | `HEPSIBURADA_PRODUCT_DETAIL_DEFAULTS` — **added 2026-08-28** | The barcode backfill (api-references §2.14). The slowest tier in the system, because it is the only one that costs one request per **product**: Whiskas' 564 products are 16 catalogue requests and 564 of these. Not operator-settable — this one is meant to run for days without ever competing with a sweep. |
| detail cache TTL | 1 h | same | Ten minutes is tuned for a price that moves; a barcode does not. |
| `BARCODE_BATCH_SIZE` | 60 | `packages/jobs/pipeline/resolve-product-barcodes.ts` | Products per run — about a quarter-hour at 4/min. Long enough to make progress on a 564-product brand, short enough that a run is never the thing holding the queue. `barcode_resolved_at` makes each run resume where the last stopped. |
| `BARCODE_MAX_CONSECUTIVE_FAILURES` | 5 | same | Ends a run early. The failures come in two kinds and only one is worth continuing through: a dead product fails alone, while a blocked client fails all 60 — and grinding through them proves nothing while making 60 requests to a marketplace already refusing us. |
| `BARCODE_MAX_ATTEMPTS` | 3 | `packages/db/repositories/product-barcodes.ts` | Failed reads before a product leaves the work list. Without a ceiling the permanently broken rows sit at the head of every run for ever and `BARCODE_MAX_CONSECUTIVE_FAILURES` above turns that into a job that never progresses. Three, because the failures worth retrying are transport hiccups and those do not survive three attempts an hour apart. Such rows are reported as **failed** in the coverage figures, never as pending — "nobody will ask about this again" and "its turn has not come" are different facts. |
| `SCRAPE_CYCLE_MS` | 1 h | `packages/jobs/scrape-config.ts` | The cycle the tier multipliers below are expressed in. |
| `SCRAPE_WARM_EVERY_N_CYCLES` | 24 | same | doc 07 §4: Warm is scraped daily. Since 2026-08-26 this is an **elapsed-time** window (24 × `SCRAPE_CYCLE_MS` since the listing was last successfully scraped), not a modulus over a cycle counter — doc 07 §4.1 G-1 records why. |
| `SCRAPE_COLD_EVERY_N_CYCLES` | 168 | same | doc 07 §4: Cold is scraped weekly. Same elapsed-time treatment. |
| `SCRAPE_MAX_LISTINGS_PER_RUN` | 200 | same | Ceiling so one cycle can never crawl the whole catalogue — the legacy scraper's dominant cost (doc 04 §1.5). Candidates are ordered oldest-scraped-first, so this is a rotation rather than a cut-off (doc 07 §4.1 G-2, fixed 2026-08-26). |
| `MAX_NAVIGATIONS_PER_PAGE` | 300 | `playwright-fetch.ts` — **added 2026-09-11** | How many navigations one Chromium page serves before it is recycled. Both browser deaths on the live install read as memory growing with every page rendered rather than as bad luck — the browser vanished after ~1,400 navigations on 2026-08-28, and a renderer crashed under a whole catalogue on 2026-09-07 — and neither recovery path makes a crash free: it costs the product in flight, and a small machine's worst moment to launch a replacement browser is the moment it just ran out of memory. Well under the only figure ever measured, and well above the ~120 navigations an hourly `ScrapeCompetitors` run makes at 30/min, so an ordinary run never pays for a relaunch and a catalogue sweep pays for a handful. |
| `--disable-dev-shm-usage` | always on | same | Chromium puts shared-memory files in `/dev/shm`, 64 MB in a default container and small on a trimmed Linux install; a renderer that outgrows it dies with exactly the `Page crashed` above. The documented fix. No-op on Windows. |
| `SCRAPE_TRACKED_CHUNK` | 100 | same | Products per chunk of a tracked sweep **pass** (doc 07 §7.4), **replacing `SCRAPE_MAX_TRACKED_PER_RUN` (300) on 2026-09-12**. Not a ceiling: a pass walks every active product and then starts again, so this is only the granularity at which the candidate query is re-run, the pass counters are advanced, and the failure guard below is evaluated. The ceiling it replaces was a sound answer to the 2026-08-28 outage (doc 07 §4.1 G-3) but made a full lap of 4,679 rows take sixteen hours and reported itself, rather than the catalogue, as the run's total. What makes a ceiling unnecessary is the pass **cursor** — `last_scraped_at` against `tracked_scrape_passes.started_at` — which is what the uncapped 2026-08-28 run lacked: it could not resume, so every restart began the catalogue again. |
| `SCRAPE_TRACKED_CONCURRENCY` | 3 | same | How many tracked products a pass reads at once, **added 2026-09-12**. Matched to `PAGE_POOL_SIZE` below. **Raises no limit**: the source's single shared rate limiter is still the ceiling. It exists because the limiter was never the bound — one Chromium page delivers a page load every 8-15 s on the operator's machine against an allowance of 30 a minute, so the sweep spent about a fifth of what it was already permitted. |
| `PAGE_POOL_SIZE` | 3 | `playwright-fetch.ts` — **added 2026-09-12** | Chromium pages serving fetches at once, replacing the single page every fetch queued behind. Three, not "as many as the rate limit allows": each page is a real renderer, and on the machine whose page-load timeout had to be raised to 30 s memory is the scarce resource (see `MAX_NAVIGATIONS_PER_PAGE`). Each lane keeps its own session health, so one crashed renderer costs its own in-flight product instead of every fetch until a restart. |
| `SCRAPE_BRAND_SELLERS_CHUNK` | 50 | same | Products per page of the whole-brand seller scrape (doc 07 §7.3), **added 2026-09-08**. The granularity at which the candidate query is re-run (so a product paused mid-run is honoured) and at which the failure guard below is evaluated. |
| `SCRAPE_BRAND_SELLERS_MAX_PRODUCTS` | 20 000 | same | Runaway guard on one whole-brand seller scrape, **added 2026-09-08** — deliberately **not** a chunk size like the sweep's. The operator pressed "bu markanın tamamını oku", and the largest brand measured is 5,204 products, so the ceiling sits far above any real brand and exists only so a bug that stopped `last_scraped_at` advancing costs one long run rather than an endless one. Hitting it logs `BrandSellerScrapeTruncated`. |
| `SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT` | 25 | same | Ends a tracked read early after this many failures **in a row** — **added 2026-08-28**. Since concurrency arrived (2026-09-12) the bound is this plus whatever had already started, and the sweep's pass stays **open** so the products not reached are the next run's first. Same reasoning as `BARCODE_MAX_CONSECUTIVE_FAILURES` above: one dead page fails alone, a dead *source* fails all of them, and grinding through 2,700 of those spends a rate-limit token and writes a failure row for each while proving nothing. Logs `TrackedProductsScrapeHalted` at `warn` — the per-failure silence of doc 07 §7 would otherwise hide it. |
| `SCRAPE_FAILURE_RATE_ALERT_THRESHOLD` | 0.25 | same | doc 07 §7: the failure *rate* alerts, not each failure. |
| `SCRAPE_FAILURE_RATE_MIN_SAMPLE` | 10 | same | Below this a rate is noise; no alert is raised at all. |
| `ALERT_STALE_AFTER_MS` | 24 h | same | doc 06 §6.2: past this, the alerts screen leads with "this data is not current" instead of the open count. Measured from `scrape_runs.status = 'ok'` only — a job failing every hour is not fresh data. |
| `ALERT_DEFAULT_QUIET_PERIOD_MS` | 6 h | same | Default only; stored per rule and operator-editable. Applies to **re-opening** a resolved alert, never to one still open and never to the first. Zero would let a competitor oscillating around a threshold open a new alert every scrape cycle — hourly on a Hot listing — and bury the alerts that matter. |
| `SELLER_IDENTITY_MAX_AGE_MS` | 48 h | same | Beyond it, `secondSellerId` is treated as unknown (doc 03 §6.5). Stale identity is worse than none: it re-probes against a competitor who has left. |
| `job.ScrapeCompetitors.enabled` | **absent ⇒ off** | `app_settings` | api-references §1.6 and §2.11: reading either source needs an explicit business decision. The only job in doc 07 §1 that defaults to disabled. |
| `job.<jobName>.enabled` (every job) | **absent ⇒ the catalogue default; present but neither `"true"` nor `"false"` ⇒ off** — **changed 2026-09-25** | `app_settings` | Only a missing row means "no preference". A row holding anything else used to fall back to the default too, and the default is *on* for `Reprice` and `SubmitPriceChanges`: a request with no `enabled` field stored `"undefined"` and switched the price path on (measured 2026-09-25). `isJobEnabled` now reads an unreadable value as off, the way the global kill switch reads one as engaged, and `/api/jobs/enabled`, `/api/kill-switch`, `/api/kill-switch/marketplace` and `/api/system-pause` refuse a non-boolean with 400 before anything is stored. |
| `scrape.<marketplace>.rateLimit` | **absent ⇒ compiled default above** | `app_settings`, `{requestsPerMinute, burst, requestTimeoutMs?}` JSON — **added 2026-08-17, timeout added 2026-09-11** | doc 06 §7's Jobs screen ("Tarama Hızı"): an operator who sees a run of 403s can lower the rate, and one whose event log fills with `Timeout … exceeded` can give each page longer, without a code change. Read once at worker startup (`buildCompetitorSources`, `apps/worker`) and passed into every source's constructor — a change takes effect on the worker's next restart, same as the credentials it sits next to. `requestTimeoutMs` is **optional and range-checked** (2–120 s): absent keeps each source on its own compiled default, which is not the same number for a product page and a catalogue page, and an out-of-range or non-numeric value is dropped on its own rather than failing the whole setting — the rate is the part a run cannot proceed without. It is emphatically not a rate; `RateLimiter` never sees it. Cache TTL remains construction-only. **Ceilings added 2026-09-25:** `SCRAPE_RATE_MAX_PER_MINUTE` = 120 and `SCRAPE_BURST_MAX` = 20 — the route refuses anything above with 400, and a stored value above is clamped on read. 100,000/min had been accepted. |
| `job.<jobName>.cadenceMs` | **absent ⇒ `JOB_CATALOG`'s compiled default** (doc 07 §1) | `app_settings`, a JSON number of milliseconds — **added 2026-08-19** | doc 07 §8.1, R-JOB-2: an operator can change how often any cadence-driven job fires (every job in the catalogue except `ImportBundles`, which has no cadence at all) from the Jobs screen, without a code change. Floored at `MIN_JOB_CADENCE_MS` (10 s) — below the fastest catalogue default (`SubmitPriceChanges` at 30 s) is almost certainly a typo. Read once at worker startup (`getJobCadenceMs`, `packages/jobs/src/job-catalog.ts`) — a change takes effect on the worker's next restart, same as the scrape rate limit above. The Jobs screen badges a saved-but-not-running value and offers **Worker'ı Yeniden Başlat** to apply it without a PowerShell prompt (doc 07 §8.1, doc 06 §7.3); that restart re-reads the scrape rate limit too. |
| `brandAudit.thresholds` | **absent ⇒ `DEFAULT_AUDIT_THRESHOLDS`** (`packages/core/src/brand/audit-findings.ts`) | `app_settings`, a JSON object of whole numbers — **added 2026-08-28** | doc 06 §12.4, Faz 6: every number that decides whether a seller appears on an audit list is one of nine keys here, editable from the findings screen itself rather than from a settings page three clicks away. Merged over the compiled defaults on read, so a threshold added later arrives at its documented value instead of `undefined` — which would compare false against every deviation and silently retire a whole signal. Written through `setAppSetting`, so the audit row naming who changed it is part of the same call; a number that decides who lands on a compliance list must not change without a trace. Read per request, not at startup: changing it re-answers the whole archive immediately, which is what an operator expects from a number they were invited to tune. |

R-CFG-2 applies: the tier multipliers and per-run ceiling are job payload fields, overridable
per run without a rebuild; the rate limit is now an `app_settings` override with the same
property. Cache TTL and timeout remain construction parameters of each source with the defaults
above.

---

## 13. Brand-audit constants — **added 2026-09-03**

The nine audit thresholds already live in `app_settings` under `brandAudit.thresholds`, merged
over `DEFAULT_AUDIT_THRESHOLDS` and edited from `/watched-brands/findings` (doc 06 §12.4). The
2026-09-03 extension adds one threshold, one environment variable and three scheduling weights.

| Constant | Default | Where | Why this value |
|----------|---------|-------|----------------|
| `referenceBelowPct` | 5 | `DEFAULT_AUDIT_THRESHOLDS`, overridable in `app_settings` | How far under the brand's own published price a seller may sit before it is a finding. **Not zero**, and not leniency: a list price is quoted to the lira while a marketplace price moves by kuruş, and a campaign badge routinely takes a percent off the displayed figure without anyone deciding to undercut anything. Zero tolerance would file every one of those beside a genuine 30% cut, and the operator would learn to skim the list. |
| `FINDINGS_WEBHOOK_URL` | *(unset)* | env (`packages/shared` bootstrap) | Where new audit findings are pushed. **Bootstrap configuration rather than a settings row because the URL is a credential**: a Slack or Teams webhook address is a bearer token in URL form, and CLAUDE.md forbids a credential in a database column. Unset is the normal state and disables pushing entirely — findings are still derived, still stored and still on the screen, and the screen says nobody is being told. |
| `MAX_FINDINGS_PER_MESSAGE` | 10 | `packages/jobs/pipeline/findings-notifier.ts` | Findings described in one message; the rest are counted. A first run over an established archive can open hundreds at once, and a message that pastes all of them is one nobody reads — the same failure as sending nothing, arrived at more expensively. |
| `EvaluateBrandFindings` cadence | 6 h | `JOB_CATALOG`, operator-overridable | Roughly a working half-day. The job makes **no marketplace requests**, so the cadence is set by how fresh a notification should be rather than by politeness to anyone: fast enough that a blocked seller returning is noticed the same day, slow enough that nobody learns to ignore the channel. |
| `ROTATION_BASE_INTERVAL_MS` | 1 h | `packages/jobs/pipeline/tracked-rotation.ts` | The interval an ordinary tracked product waits between deep-scrape looks — one cycle of `ScrapeCompetitors`. |
| `ROTATION_WEIGHTS.noSellers` | ×6 | same | A product the last successful look found nobody selling. Checking an empty page hourly buys almost nothing: the interesting event is a seller *appearing*, and a day's delay in noticing that is acceptable where a day's delay on a live price war is not. Emphatically not "never" — a product only leaves the rotation by being deactivated, which is a person's decision. |
| `ROTATION_WEIGHTS.neverRated` | ×3 | same | The marketplace has never recorded a rating — the same "nobody buys this" proxy the dead-product suggestion acts on (doc 06 §12.4), used here for something far gentler than deactivation. Only a genuine `0` counts; `null` is our own failure to read and earns no penalty. |
| `ROTATION_WEIGHTS.listed` | ×0.5 | same | The card is in the brand module's İlanlar — linked to a brand product or marked favourite (doc 17 §4.1). That is an operator saying in as many words that this card matters. Replaced `hasReferencePrice` on 2026-09-19, which was a proxy for the same thing (doc 17 §2.5). Applied once for a card that is both. |

⚠️ The rotation weights scale an **interval**, and overdue-ness is measured in multiples of each
product's own interval. That is what stops a deprioritised product from starving: its position
rises without limit as it waits and it eventually overtakes a favoured product that was read
recently. A fixed weight instead would let a large enough favoured set hold the head of the
queue for ever, and nothing would say so.

## 14. Brand-module constants — **added 2026-09-19**

Specified in doc 17. Credentials are environment variables (CLAUDE.md); recipients and switches
are `app_settings` rows (doc 05, brand module tables).

| Constant | Default | Where | Why this value |
|----------|---------|-------|----------------|
| `modules.seller`, `modules.brand` | absent = enabled, so an upgraded install keeps both; chosen in setup on a new one | `app_settings` | Read at **job dispatch**, not worker boot, so disabling the seller module stops price writes on the next tick (doc 17 §1.3). |
| `SweepListedProducts` cadence | 30 min | `JOB_CATALOG`, operator-overridable | A listings pass is tens of cards and finishes in minutes; the cadence is the gap between pass starts. Fresh enough for a price alarm to be same-hour, without re-reading the same pages continuously. |
| `DeliverNotifications` cadence | 1 min | `JOB_CATALOG` | Makes no marketplace request; the cadence only sets how soon a new violation reaches a phone. |
| `MAX_VIOLATIONS_PER_MESSAGE` | 10 | `packages/jobs` | Same reasoning as `MAX_FINDINGS_PER_MESSAGE` (§13): a first sweep after a large import can open hundreds at once. |
| `NOTIFY_MAX_ATTEMPTS` | 10 | `packages/jobs` | At one-minute cadence, ten minutes of a channel being down before a delivery is marked `failed` and shown as such. |
| `BAND_RENOTIFY_QUIET_MS` | 6 h | `packages/jobs` | A seller oscillating around a bound reopens a violation every listings pass (30 min). The violation history records every reopening; the channel stays quiet for a working half-day. |
| `ALERTS_WEBHOOK_URL` | *(unset)* | env | Webhook for band violations. Separate from `FINDINGS_WEBHOOK_URL` so audit findings and price alarms can go to different channels. A credential in URL form (§13). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | *(unset)* | env | E-mail channel. Unset disables the channel; deliveries stay pending with the reason shown. |
| `SMS_PROVIDER` + provider credentials | *(unset)* | env | **Provider not yet chosen** (doc 17 §7). The port and settings exist; the adapter is written for the chosen provider. |
