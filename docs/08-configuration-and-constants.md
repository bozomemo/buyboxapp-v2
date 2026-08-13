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
