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
| `SCRAPER_BROWSER_USER_AGENT` | a current Chrome UA | env (same) | **Both Trendyol and Hepsiburada public scrapers.** Hepsiburada's endpoint returns 403 to an honest agent (§2.11 records the ablation); the product owner authorised the exception on 2026-08-13. Trendyol's bot detection was found to do the same even at a conservative request rate — confirmed 2026-08-17 when the operator's own browser reached the same product page without incident from the same network while the honest agent was blocked — and the product owner authorised the identical reporting-only exception for Trendyol on 2026-08-17 (api-references §1.6). Deployment config so it is visible, and because a UA naming a browser version that no longer exists is itself a bot signal and must be refreshed. |
| requests/minute | 30 | `TRENDYOL_SCRAPE_DEFAULTS` | Well under any plausible threshold; the job has no deadline. |
| burst | 5 | same | A full minute's allowance as burst would defeat the limit. |
| cache TTL | 10 min | same | Variants of one product share a page; doc 07 §7 requires identical requests be cached. |
| request timeout | 15 s | same | A hung page must not hold a worker slot. |
| `retryOn403MaxAttempts` | 3 (2 retries) | same | Kept as a cheap, bounded second line of defence even after the transport fix below. Applied only to 403. |
| `retryOn403BaseMs` | 300 ms, doubling, capped at 5 s | same | Short: when the old flakiness was measured, it resolved on the very next attempt, not after a long wait. |
| HTTP transport | Playwright headless Chromium (`playwright-fetch.ts`) | `TrendyolPublicPageSource`'s default `fetchFn` | **Added 2026-08-17, root cause of the 403s, corrected same day.** First attempt (`node-https-fetch.ts`, Node's core `https` in place of the platform `fetch`) was based on a measurement that turned out not to hold: re-tested live, Node's `https.request` also returned 403 consistently, including with a full realistic browser header set. The actual cause is Cloudflare fingerprinting the **TLS ClientHello**, not the HTTP layer — `fetch` (undici) and Node's core `https` both sit on the same OpenSSL TLS stack and are scored identically; `curl` had only ever succeeded because it happened to run through Windows' Schannel TLS on the diagnostic machine, not something production can rely on. A real headless browser has a real browser TLS/JS fingerprint, which is what Trendyol's bot management actually accepts — confirmed 2026-08-17: 10/10 consecutive previously-failing product pages returned 200. `node-https-fetch.ts` is kept as an injectable alternative (and its own passing tests) but is no longer the default. See `playwright-fetch.ts`'s doc comment for the full record, including a Playwright quirk found along the way: reading a response body via `response.text()` on a page reused for a later navigation made that later navigation's own timeout stop being enforced; the fetcher reads `page.content()` instead. |
| requests/minute | **10** | `HEPSIBURADA_SCRAPE_DEFAULTS` | Stricter than Trendyol for a measured reason: ~8 rapid requests tripped a temporary Akamai block on 2026-08-13 (§2.11). |
| burst | 3 | same | Same measurement. |
| cache TTL | 10 min | same | As Trendyol; several of our listings can share one marketplace SKU. |
| request timeout | 15 s | same | As Trendyol. |
| `SCRAPE_CYCLE_MS` | 1 h | `packages/jobs/scrape-config.ts` | The cycle the tier multipliers below are expressed in. |
| `SCRAPE_WARM_EVERY_N_CYCLES` | 24 | same | doc 07 §4: Warm is scraped daily. |
| `SCRAPE_COLD_EVERY_N_CYCLES` | 168 | same | doc 07 §4: Cold is scraped weekly. |
| `SCRAPE_MAX_LISTINGS_PER_RUN` | 200 | same | Ceiling so one cycle can never crawl the whole catalogue — the legacy scraper's dominant cost (doc 04 §1.5). |
| `SCRAPE_FAILURE_RATE_ALERT_THRESHOLD` | 0.25 | same | doc 07 §7: the failure *rate* alerts, not each failure. |
| `SCRAPE_FAILURE_RATE_MIN_SAMPLE` | 10 | same | Below this a rate is noise; no alert is raised at all. |
| `ALERT_STALE_AFTER_MS` | 24 h | same | doc 06 §6.2: past this, the alerts screen leads with "this data is not current" instead of the open count. Measured from `scrape_runs.status = 'ok'` only — a job failing every hour is not fresh data. |
| `ALERT_DEFAULT_QUIET_PERIOD_MS` | 6 h | same | Default only; stored per rule and operator-editable. Applies to **re-opening** a resolved alert, never to one still open and never to the first. Zero would let a competitor oscillating around a threshold open a new alert every scrape cycle — hourly on a Hot listing — and bury the alerts that matter. |
| `SELLER_IDENTITY_MAX_AGE_MS` | 48 h | same | Beyond it, `secondSellerId` is treated as unknown (doc 03 §6.5). Stale identity is worse than none: it re-probes against a competitor who has left. |
| `job.ScrapeCompetitors.enabled` | **absent ⇒ off** | `app_settings` | api-references §1.6 and §2.11: reading either source needs an explicit business decision. The only job in doc 07 §1 that defaults to disabled. |
| `scrape.<marketplace>.rateLimit` | **absent ⇒ compiled default above** | `app_settings`, `{requestsPerMinute, burst}` JSON — **added 2026-08-17** | doc 06 §7's Jobs screen ("Tarama Hızı"): an operator who sees a run of 403s can lower the rate without a code change. Read once at worker startup (`buildCompetitorSources`, `apps/worker`) and passed into the source's constructor — a change takes effect on the worker's next restart, same as the credentials it sits next to. Cache TTL and request timeout remain construction-only; only the two knobs that determine how *fast* requests go out to the marketplace were promoted. |
| `job.<jobName>.cadenceMs` | **absent ⇒ `JOB_CATALOG`'s compiled default** (doc 07 §1) | `app_settings`, a JSON number of milliseconds — **added 2026-08-19** | doc 07 §8.1, R-JOB-2: an operator can change how often any cadence-driven job fires (every job in the catalogue except `ImportBundles`, which has no cadence at all) from the Jobs screen, without a code change. Floored at `MIN_JOB_CADENCE_MS` (10 s) — below the fastest catalogue default (`SubmitPriceChanges` at 30 s) is almost certainly a typo. Read once at worker startup (`getJobCadenceMs`, `packages/jobs/src/job-catalog.ts`) — a change takes effect on the worker's next restart, same as the scrape rate limit above. The Jobs screen badges a saved-but-not-running value and offers **Worker'ı Yeniden Başlat** to apply it without a PowerShell prompt (doc 07 §8.1, doc 06 §7.3); that restart re-reads the scrape rate limit too. |

R-CFG-2 applies: the tier multipliers and per-run ceiling are job payload fields, overridable
per run without a rebuild; the rate limit is now an `app_settings` override with the same
property. Cache TTL and timeout remain construction parameters of each source with the defaults
above.
