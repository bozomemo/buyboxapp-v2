# 09 — Known Defects & Risks

Findings from reading the source. Each entry states the defect, its consequence, and what the
rewrite must do. Ordered by severity.

Severity key: **S1** money at risk / data loss · **S2** wrong behaviour · **S3** fragility ·
**S4** maintainability.

---

## 1. Secrets in source control — **S1**

Live marketplace credentials, store passwords and two MySQL connection strings with passwords
are committed in plain text (`MarketPlaces/HepsiBurada.cs`, `MarketPlaces/N11.cs`,
`MarketPlaces/GittiGidiyor.cs`, `Database/SQLFunctions.cs`, `App.config`). The `marketplacesettings`
table also has a plain-text `Password` column.

**Consequence:** anyone with repository access can place orders, change prices, and read the
database. If the repository is ever pushed to a public host, the credentials are compromised
permanently, including in git history.

**Action:** rotate every credential now. Then externalise per doc 08 §11. Scrub history if the
repository is ever published.

---

## 2. Price submissions are never verified — **S1**

Neither marketplace's confirmation channel is used:

- Trendyol returns a `batchRequestId`; the result endpoint is implemented but never called.
- Hepsiburada returns an upload `id`; the status endpoint is called in one overload and its
  response is discarded.

**Consequence:** a rejected price update is invisible. Worse, the audit row claiming the change
happened poisons the idempotency gate (§3), so the engine believes it already acted and stops
retrying. A listing can sit at a wrong price indefinitely.

**Action:** poll to a terminal state; record per-item success/failure; only then write the
audit row.

---

## 3. The idempotency gate is effectively disabled — **S1**

Both engines gate action on a condition ending in `… OR NOT justGotBuybox` (Trendyol) /
starting with `NOT justGotBuybox OR …` (Hepsiburada). In the steady state `justGotBuybox` is
false, so the whole disjunction is true and the "has anything changed?" test never suppresses
anything.

**Consequence:** the price ratchets on every polling cycle even when nothing changed. In the
buybox this walks the price up 0.10–4.00 of net proceeds per pass until a competitor reacts —
which is arguably the intent — but it also means unnecessary API traffic and a permanently
oscillating price.

**Action:** decide the intended semantics with the operator. Most plausibly the term should be
removed, leaving the four genuine change conditions.

---

## 4. Hepsiburada decreases are not floor-checked — **S1**

`HBAutoBB.AutoChangePrice` computes a decreased price and submits it without comparing it to
`LowestSellablePrice`. Only the close-out branch, on a *later* cycle, pulls it back.

**Consequence:** at least one polling cycle of selling below cost after every overshoot.

**Action:** enforce `newPrice ≥ floor` before every decrease, in both engines.

---

## 5. Audit rows are written before submission — **S1**

`HBAutoBB` writes `hbpricechanges` and *then* enqueues into the batch buffer. If the batch
fails, or the loop is cancelled with a partial buffer, the change never reaches Hepsiburada
but the audit says it did — and §3's gate reads that audit.

**Action:** pending → confirmed/failed state machine, or write-after-confirm.

---

## 6. Cancelling the HB loop drops queued price changes — **S1**

`bwHbAutoBb_DoWork` returns immediately on cancellation without calling
`CommitChangesAndClearList()`. Up to four recorded-but-unsent changes are lost.

**Action:** flush on cancellation and on shutdown (R-JOB-8).

---

## 7. `getUnitPrice` returns `999` on failure — **S1**

A missing stock row, an unparseable code, or an undefined bundle yields cost `999` (C#) or
`−1` (SQL). Both then flow into the floor calculation as if they were real costs.

**Consequence:** `999` makes the listing look wildly unprofitable and freezes it; `−1` makes
the floor negative, permitting the engine to price arbitrarily low.

**Action:** a missing cost must be an error that excludes the listing from automation and
raises an operator alert.

---

## 8. `Farmazon.ClearFzListings` runs before settings are loaded — **S2**

`ClearFzListings()` uses `mysqlConnectionString` but does not call `ImportSettings()` first,
and the UI calls it as the very first step of the Farmazon import. On a cold start the field is
`null` and the truncate throws (caught and logged).

**Action:** eliminate lazy static init entirely; inject configuration.

---

## 9. Inverted null check in the Farmazon listing upsert — **S2**

```csharp
var buyingPrice = listingToken["buyingPrice"] == null
                  ? Convert.ToDouble(listingToken["buyingPrice"])   // converts null
                  : 0;                                              // discards the real value
```

The branches are reversed: when the value exists it is thrown away, when it is null it is
converted anyway. `buyingPrice` is therefore always 0.

---

## 10. `GetOptimum_Price_Values` reads the wrong column — **S2**

```csharp
var bcbprm = mySqlDataReader["Before_Change_Buybox_Price"].ToString();
```

`bcbprm` is the buybox *promotions* string but is read from the buybox *price* column.

**Consequence:** the promotion-changed comparison in the Trendyol gate compares a promotion
string against a stringified price — always unequal, so `secondSellerPromotionsChanged` is
effectively always true, further defeating the gate (§3).

---

## 11. Close-out branch dereferences a possibly-null runner-up — **S2**

`TYAutoBB.Get_Buybox`'s close-out path reads `productCard.second_Seller.has_Basket_Discount`
with no null guard, while every other branch guards it. A sole-seller listing that has fallen
below its floor throws a `NullReferenceException`, is logged, and is never corrected.

---

## 12. Grid highlight and engine read different competitor prices — **S2**

`BuyboxMerchantPrice` is the string `"listingPrice / finalPrice"`. The row-painting code parses
`[0]` (listing price); `HBAutoBB` parses `[1]` (final price).

**Consequence:** the green "you can win this buybox" highlight and the bot's decision disagree
whenever a basket campaign is active.

**Action:** typed fields, never composite strings (R-UI-2).

---

## 13. The final page of a Hepsiburada import loses buybox data — **S2**

SKUs are collected in batches of 10 and flushed only inside the `if (offset + limit < totalCount)`
recursion branch. On the last page, the trailing partial batch is never sent.

---

## 14. Order import fetches no date range and does not page — **S2**

`GetOrdersPendingApproval` computes `beginDate`/`endDate` and never attaches them to the query
string; it reads `totalCount` and never pages. Combined with the destructive delete-first
pattern, an import can *reduce* the stored order set.

---

## 15. `List_Price` edit truncates to integer — **S2**

The grid's list-price handler does `Convert.ToInt32(...)` before sending, silently discarding
decimals on a value the marketplace accepts as a decimal.

---

## 16. Cross-thread UI access — **S3**

- `GetBarcodeCommTupleList` reads `DataGridViewRow` cells from a `BackgroundWorker` thread.
- `dgvHbProductCardTable_CellEndEdit` and the Trendyol cell-edit handlers read grid cells from
  spawned threads.
- `MessageBox.Show` is called from background threads in many places.

WinForms does not support this. Symptoms range from silent wrong values to
`InvalidOperationException`.

---

## 17. Worker restart logic can double-start — **S3**

Each of the paired workers, on completion, checks whether the other is busy and starts **both**.
Interleaved completions can start an already-running worker (throwing) or launch redundant
passes.

---

## 18. Index-based work splitting over a live, sortable grid — **S3**

Work is split at `rows.Count / 2` computed on a background thread while the operator can sort
or filter. Rows get processed twice or skipped.

---

## 19. Recursive paging — **S3**

Hepsiburada listing import and Farmazon listing import both recurse once per page. Deep
catalogues risk stack exhaustion. Use loops.

---

## 20. Filter expressions built by string concatenation — **S3**

`bindingSource.Filter` is assembled from raw text-box contents. A `'` in a search term throws;
a crafted term alters the expression.

Similarly, `RefreshBundleTable` interpolates a stock id directly into SQL.

---

## 21. XML built by concatenation, prices formatted with ambient culture — **S3**

The Hepsiburada inventory-upload XML is string-concatenated with no escaping, and numeric
interpolation uses the current culture. On a Turkish-locale machine `149.90` can serialise as
`149,90`.

**Action:** a real serialiser and `InvariantCulture` everywhere on the wire.

---

## 22. Scraping is the system's structural single point of failure — **S3**

All Trendyol competitor data comes from parsing an embedded JSON blob located by
`indexOf("{\"product\"")` and `indexOf("}};")` inside the first `<script>` of the page body.
One page-structure change breaks all Trendyol repricing silently.

Additionally: one page load per listing per cycle, no caching, no rate limiting, no backoff, no
respect for robots/ToS considerations.

**Action:** check whether Trendyol now exposes buybox data via its Seller API. If not, obtain an
explicit business decision, and implement rate limiting, caching, and graceful degradation.

> **Resolved in the rewrite (2026-08-13).** Trendyol does expose an official buybox endpoint
> (api-references §1.4), so the control path no longer scrapes: this is no longer a single
> point of failure but a reporting feature whose total loss costs only competitor history
> (doc 12 Phase 7 DoD, asserted by test). The parser locates its payload by marker and reads a
> balanced object rather than by `indexOf`; rate limiting, caching, tiering, an honest
> user-agent and a per-run ceiling are all in place; and the business decision is honoured by
> shipping the job **disabled**. See api-references §1.6 and
> `docs/trendyol-merchants-scraping-guide.md`.

---

## 23. Unbounded tables and no pruning — **S3**

`trace_optimum_price`, `hbpricechanges` and `log_table` are append-only and never pruned, yet
the idempotency gate does `ORDER BY … DESC LIMIT 1` against them on every listing on every
cycle. `trace_optimum_price` has an index on `Barcode`; `hbpricechanges` has **no index at all**.

---

## 24. `vw_hblistings` is O(rows × queries) — **S3**

Roughly twenty scalar functions per row, most running sub-queries, several nested. Selecting the
view for the whole catalogue is the main reason the UI stalls.

---

## 25. Delete-then-reload imports — **S3**

Competitor and pricing tables are emptied before every import, so the system is blind for the
duration and inconsistent after a crash.

---

## 26. `ProfitPercentage` trigger divides by zero — **S3**

`(Trendyol_Selling_Price / Lowest_Sellable_Price) − 1` with a zero floor.

---

## 27. Duplicated, divergent implementations of the same formulas — **S4**

`GetPriceWithoutExpenditure` and `GetLowestSellablePrice` exist in **both** C# (`HBAutoBB`) and
SQL, with different constants and different band edges. The C# copies are dead — the live path
goes through the view — but they are the ones a reader finds first.

Likewise the stock-code grammar is parsed in five places (`parseStockCode`,
`parseStockCodeProductCard`, `getBaseStockCode`, `sfGetUnitCountFromStockCode`,
`SF_GETBASESTOCKCODE`) with different edge-case handling.

---

## 28. Bundle support is capped at five members by a hand-unrolled loop — **S4**

`sfGetTotalStock` and `SFGETUNITPRICE` walk the pipe-joined list with nested `if` blocks rather
than a loop, five levels deep.

---

## 29. Presentation formatting inside the database — **S4**

`SFGETHBMERCHANTPRICEVIEW`, `SFGETHBMERCHANTNAMERATINGVIEW`, `SFGETBASKETRATIOVIEW`,
`SFGETHBMERCHANTVIEW` exist to fill grid cells; the engine then parses them back into numbers.

---

## 30. Substantial dead code — **S4**

Unused or stubbed: the whole GittiGidiyor and N11 modules; Farmazon order handlers with empty
bodies; the commented-out DOM scraper; `Deneme`/`TrialCodes`/`Api_Code_Trials`/`DENEMESP`;
`vw_hblistingsft`; `SFGETEXPENDITURE`; `bundle_table`; `hb_price_changes`;
`marketplace_orders_old`; `orders_deneme`; `secret_stock`; `hb_category_administrators`;
`Trendyol Ayarları` form; `InitializeFormHelper` (`// TODO : Fill the class.`); the shipping-label
methods; `FileFunctions.WriteLog` / `WritePossibleBuybox`.

---

## 31. Licensing — **S4**

EPPlus is initialised with `LicenseContext.NonCommercial` while being used in a commercial
operation. EPPlus 5+ requires a commercial licence for commercial use.

---

## 32. VAT rate is stale — **S2**

The commission VAT multiplier is `1.18` throughout, reflecting an 18% VAT rate. Turkey's
standard VAT rate is 20%. Every Hepsiburada floor price is therefore understated unless the
`marketplacesettings.CommissionRateVat` row was updated (the C# path ignores it regardless).

**Action:** confirm current rates with the operator and make them effective-dated (R-CFG-3).

---

## 33. No tests of any kind — **S4**

There is no test project. The pricing formulas — the part of the system where an error costs
real money — have zero automated coverage.

**Action:** the rewrite must ship with table-driven unit tests for every formula in doc 02 and
every decision branch in doc 03, plus recorded-response integration tests per marketplace.
