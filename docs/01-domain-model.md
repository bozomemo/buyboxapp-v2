# 01 — Domain Model

This document defines the entities and, critically, the **stock-code grammar** that the
entire cost model depends on. Get this wrong and every price is wrong.

## 1. Entity map

```
        StockItem (physical product, from ERP)
        PK: baseStockCode
             │ 1
             │
             │ N
        Listing  ──────────────┐
        (marketplace offer)    │
             │                 │
             │ has             │ competes with
             ▼                 ▼
        PricingProfile     CompetitorOffer (ranked 1..N)
        (basket campaign,
         commission)

        Bundle  ── composed of ──▶ StockItem (1..N, with quantity)
        PK: bundleStockCode

        PriceChangeRecord  ── audit of every automated price move
        ErrorLogRecord     ── audit of every caught exception
```

## 2. Stock-code grammar (critical)

A **seller stock code** (Trendyol `Seller_Stock_Code`, Hepsiburada `MerchantSku`) is a
string of the form:

```
<baseStockCode> [ "-" <suffix> ] [ "." <ignored> ]
```

Parsing rules, exactly as implemented (C# `Functions` + SQL `sfGetUnitCountFromStockCode`,
`sf_getBaseStockCode`, `SFGETUNITPRICE`):

| Rule | Definition |
|------|------------|
| **Base stock code** | Everything before the first `-`. If no `-`, the whole string. |
| **No dash** | `12345` → base `12345`, unit count `1`, not a bundle. |
| **Numeric suffix** | `12345-4` → base `12345`, unit count `4`. A multi-pack: the listing sells 4 units of product `12345`. |
| **Decimal noise** | `12345-4.2` → the part after `.` is discarded; unit count `4`. Also `"` characters are stripped from the suffix before parsing. |
| **Bundle marker** | Suffix contains `k` or `K` (e.g. `12345-k2`, `12345-2k`) → this is a **bundle**, and unit count is forced to `1`. |
| **Bundle lookup** | Bundle contents are resolved from the `bundletablev2` table, not from the code itself. |

> **Rewrite note:** this grammar is inferred from string parsing in five different places
> (two C# methods, three SQL functions) with slightly different edge-case handling. The new
> system should parse it **once**, in one place, into a value object
> `StockCode { BaseCode, UnitCount, IsBundle }`, and reject codes it cannot parse rather than
> silently returning `1` or `"123456789"` (the legacy fallback).

## 3. StockItem

The physical product, keyed by base stock code.

**Target:** stock items enter the system through a pluggable `IProductSource` — manual entry,
Excel upload with operator-configured column mapping, derivation from imported marketplace
listings, or (later) a direct ERP database/API connection. See doc 10 §4. The ERP column names
below describe the legacy Excel contract and are one source among several, not the model.

Imports are idempotent upserts keyed on `baseStockCode` and must **never overwrite
operator-owned fields**: price multipliers, automation switches, and per-listing price bounds.

| Field | Meaning |
|-------|---------|
| `baseStockCode` | Primary key. From ERP column `KODU`. |
| `productName` | From ERP column `ADI`. |
| `unitPrice` | Purchase cost of **one** physical unit. From ERP column `Standart_Maliyet`. |
| `unitStock` | Physical quantity on hand. From ERP column `TOPLAM MIKTAR`. |
| `tyPriceMultiplier` | Cost multiplier applied for Trendyol pricing. Default `1`. |
| `hbPriceMultiplier` | Cost multiplier applied for Hepsiburada pricing. Default `1`. |
| `tyAutoBuyboxEnabled` | Master automation switch for Trendyol. Default `true` on insert. |
| `hbAutoBuyboxEnabled` | Master automation switch for Hepsiburada. Default `false` on insert. |
| `totalSellingStock` | Derived: total units currently offered across all listings. |

**Derived quantity — total selling stock.** For a base stock code, this is the sum over all
listings whose seller stock code starts with that base, of
`unitCount(stockCode) × sellingStock(listing)`. It answers *"if everything currently listed
sold, how many physical units would leave the shelf?"* and is compared against `unitStock`
to detect over-listing.

## 4. Listing

One offer on one marketplace. Two concrete shapes exist.

### 4.1 Trendyol listing ("product card")

Identified by **barcode**. Notable fields:

| Field | Source | Meaning |
|-------|--------|---------|
| `barcode` | API | Primary key |
| `productContentId` | API | Identifies the *product page* (shared with competitors); used to build the scrape URL |
| `sellerStockCode` | API | Our stock code — parsed per §2 |
| `salePrice` | API | Current selling price |
| `listPrice` | API | "Piyasa satış fiyatı" (strike-through / market price) |
| `quantity` | API | Currently offered stock |
| `commission` | Excel product file, or carried from the grid | Commission % for this listing |
| `onSale`, `approved`, `rejected`, `locked`, `blacklisted` | API | Listing status flags |
| `buyBoxSeller`, `otherSellers[]` | **Scraped** | Competitor ranking, prices, ratings, basket discounts, stock |
| `commentCount`, `ratingCount` | **Scraped** | Social proof; used to pick the "main product card" |
| `increasePrice`, `decreasePrice` | Local DB | Per-listing raise-only / lower-only switches |

Trendyol keeps only the **top 5 sellers** in the model: buybox seller plus
`second_Seller` … `fifth_Seller`. Anything beyond rank 5 is invisible to the algorithm.

### 4.2 Hepsiburada listing

Identified by **HepsiburadaSku**. Notable fields:

| Field | Source | Meaning |
|-------|--------|---------|
| `hepsiburadaSku` | API | Primary key |
| `merchantSku` | API | Our stock code — parsed per §2 |
| `price` | API | Current listing price (before basket discount) |
| `availableStock` | API | Currently offered stock |
| `commissionRate` | API | Commission %, **ex-VAT** |
| `dispatchTime` | API | Days to ship; a buybox ranking factor |
| `cargoCompany1..3` | API | Must be echoed back on every update |
| `maximumPurchasableQuantity`, `minimumPurchasableQuantity` | API | Purchase limits |
| `isSalable`, `isSuspended`, `isLocked`, `isFrozen`, `isFulfilledByHB` | API | Status flags |
| `deactivationReasons[]`, `lockReasons[]` | API | Stored pipe-joined (`\|`) |
| `pricings[]` | API | Basket-discount campaigns → see §5 |
| `increasePrice`, `decreasePrice` | Local DB | Per-listing raise-only / lower-only switches |

### 4.3 Listing invariants

- `INV-1` A listing always resolves to exactly one StockItem via its base stock code. If it
  does not, cost is unknown and the listing must be excluded from automation (legacy returns
  `-1` or `999` and keeps going — see doc 09).
- `INV-2` A listing's effective cost = `unitPrice(base) × unitCount(stockCode) × priceMultiplier(base, marketplace)`,
  except for bundles (§6).
- `INV-3` The bot must never submit a price below `lowestSellablePrice`, except in the
  close-out branch where it is *raising* toward it.
- `INV-4` A listing that is locked / suspended / not salable must not be repriced.

## 5. PricingProfile (Hepsiburada basket campaigns)

Hepsiburada listings may participate in a campaign where the customer pays a lower
**final price** at checkout. The gap between listing price and final price is funded jointly:

| Field | Meaning |
|-------|---------|
| `finalPrice` | What the customer actually pays |
| `startDate`, `endDate` | Campaign window |
| `storeDebtAmount` | Percentage of the discount funded by **us** (0–100) |
| `hepsiburadaDebtAmount` | `100 − storeDebtAmount` |

Derived: `basketRatio = finalPrice / listingPrice`, defaulting to `1.0` when there is no
campaign. This ratio propagates through the whole Hepsiburada cost model (doc 02 §4).

**Parsing rule (as-is):** the API returns a `debtors` array; the code reads only the *first*
element, checks whether its `debtor` is the literal string `"Mağaza"` (store), and derives
the other side as `100 − amount`. Any third debtor type would be mis-attributed.

## 6. Bundle

A bundle listing sells several *different* products as one offer.

**Target model** (doc 05 §3): a `bundles` row plus one `bundle_members` row per member, each
carrying an explicit `quantity`. **No member limit and no quantity limit.**

| Field | Meaning |
|-------|---------|
| `bundleStockCode` | e.g. `12345-k2`. Primary key. |
| members[] | `{ memberStockCode, quantity }` |

*Legacy shape, for migration reference:* two pipe-joined string columns
(`BundleUnitStockCodes`, `BundleUnitProductNames`) parsed by a hand-unrolled five-level `if`
chain, with every member forced to quantity 1.

Rules:

- **Bundle cost** = Σ over members of `unitPrice(member) × unitCount(member) × multiplier(member)`.
- **Bundle stock** = **min** over members of `unitStock(member)`. One missing member zeroes
  the bundle.
- If a bundle stock code has **no members**, return `CostError.BundleNotDefined` and exclude
  the listing from automation. Legacy returned cost `999` and stock `-1`, silently making the
  listing unprofitable rather than failing (doc 09 §7).
- A bundle that references itself, directly or transitively, returns `CostError.BundleCycle`.
  Recursion is depth-limited.
- The five-member cap in the legacy SQL is an implementation artefact, not a business rule,
  and is removed.

### Bundle table refresh

Bundle definitions are not authored in this app. They are rebuilt from the ERP:

1. `TRUNCATE bundletablev2`.
2. Select ERP rows where the stock code matches `%-k%`.
3. For each, look up its child products in the ERP's component table.
4. Compose `baseStockCode-1|child1-1|child2-1|…` and insert.

Note that every member is written with the `-1` suffix, i.e. **bundle members are always
treated as quantity 1**. A bundle containing 2× of a product cannot currently be expressed.

## 7. CompetitorOffer

A competing seller's offer on the same product.

| Field | Trendyol source | Hepsiburada source |
|-------|-----------------|--------------------|
| `sellerName` | Scraped `merchant.name` (trimmed) | API `merchantName` |
| `rating` | Scraped `merchant.sellerScore`, `-1` if absent | API `merchantRating` |
| `sellingPrice` | Scraped `variants[0].price.discountedPrice` | API `price` |
| `basketDiscountPrice` | Scraped `variants[0].price.couponApplicablePrice` | n/a (folded into `price`) |
| `hasBasketDiscount` | `discountedPrice ≠ couponApplicablePrice` | n/a |
| `sellingStock` | Scraped `variants[0].quantity`, `0` if absent | Not exposed |
| `dispatchTime` | Not available | API `dispatchTime` |
| `hasPromotion` | Scraped `promotions.length > 0` | Not available |

**Effective competitor price** — used everywhere in the algorithms — is
`hasBasketDiscount ? basketDiscountPrice : sellingPrice`.

**Our position** is determined by string-comparing the seller name against the configured
store name. This is an exact, case-sensitive match in the Trendyol path
(`"farmaucuz"`) and a different literal in the Hepsiburada path (`"FARMAUCUZ"`).
The rewrite should use a marketplace-issued merchant id where available.

## 8. Audit entities

### PriceChangeRecord — Trendyol (`trace_optimum_price`)

Written on **every** automated Trendyol price change. Its purpose is not reporting: it is the
**memory that makes the algorithm idempotent**. Before changing a price, the engine loads the
last record for that barcode and compares the current world against it; if nothing relevant
changed, it does not act. Fields:

| Field | Meaning |
|-------|---------|
| `barcode` | Listing |
| `currentUnitPrice` | Our cost at the time of the change |
| `beforeChangeSellingPrice` / `afterChangeSellingPrice` | Price move |
| `beforeChangeInBuybox` | Were we in the buybox before? |
| `beforeChangeBuyboxPrice` | Buybox price before |
| `beforeChangeBuyboxPromotions` | Buybox seller's first promotion string |
| `secondSellerPrice`, `secondSellerPromotions` | Runner-up state |
| `beforeChangeCommissionRate` | Commission at the time (defaults to `16.0` if null) |
| `lastChangeTime` | Timestamp, millisecond precision |

### PriceChangeRecord — Hepsiburada (`hbpricechanges`)

Same role for the Hepsiburada engine: `hbSku`, `currentUnitPrice`,
`beforeChangeSellingPrice`, `afterChangeSellingPrice`, `basketRatio`, `commissionRate`,
`beforeChangeBuyboxPrice`, `beforeChangeSecondSellerPrice`, `beforeChangeInBuybox`,
`lastChangeTime`.

### ErrorLogRecord (`log_table`)

Every caught exception in the system is written here: class name, method name, exception type
and message, inner exception type and message, timestamp, plus the stock code and barcode in
scope. This is the **only** error channel besides modal dialogs — there is no file log, no
structured logging, no correlation id.

## 9. Order entities (peripheral)

Order import exists but is not part of the repricing loop. Hepsiburada orders awaiting
approval are imported into two tables and then joined against cost data to compute per-line
**profit**:

- `MarketplaceOrder` — order header: ids, dates, state, totals, shipment company, buyer
  delivery address, buyer invoice address, tax number/TC.
- `MarketplaceOrderProduct` — order line: barcode, stock code, name, quantity, unit and total
  price, discounts, VAT, commission rate, and three **computed at insert time** columns:
  - `currentProductUnitPrice` = current cost × quantity
  - `currentPriceWithoutExpenses` = net proceeds for the line
  - `profit` = the difference

Both tables are **cleared and fully re-imported** on every run for marketplace code `HB`;
there is no incremental sync and no order state machine.
