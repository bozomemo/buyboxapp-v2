# 00 — System Overview

## 1. What the product is

BuyBoxApp is a **marketplace repricing and listing-management tool** for a single seller
(store name `farmaucuz` / `FARMAUCUZ`) operating on Turkish e-commerce marketplaces.

Its central job is to keep the seller's selling price on each marketplace listing at the
**most profitable price that still wins (or defends) the buybox** — the marketplace's
"featured offer" slot that receives the overwhelming majority of sales.

Two things make this non-trivial and are the heart of the system:

1. **Cost is not the purchase price.** The true floor price of a listing depends on
   commission rate, VAT on commission, a cargo (shipping) fee that is tiered by price band,
   a marketing/service expenditure that only applies above a price threshold, and — on
   Hepsiburada — basket-discount campaigns whose cost is split between the store and the
   marketplace. The floor price must be recomputed constantly because all of these inputs
   change independently.
2. **Competitor state is only observable by polling.** Neither marketplace pushes buybox
   changes. The system continuously re-reads competitor prices and re-decides.

## 2. Business goals, in the operator's words

| Goal | How the system serves it |
|------|--------------------------|
| Never sell below cost | Every listing has a computed `LowestSellablePrice` ("dip fiyat"); the bot refuses to go below it, and the UI paints violations |
| Win the buybox when profitable | When not in the buybox, step price **down** toward the buybox price, but stop at the floor |
| Harvest margin when safe | When already in the buybox, step price **up** until just above the runner-up |
| Do not chase unprofitable fights | If the buybox price is already below our floor, do nothing (or raise price back to the floor) |
| Do not oversell physical stock | Physical unit stock is imported from ERP; listings that would oversell are flagged |
| Keep the operator in control | Per-stock-code and per-listing switches to disable automation, raise-only, or lower-only |

## 3. Actors

| Actor | Description |
|-------|-------------|
| **Operator** | A single power user (the store owner/manager). Runs the desktop app, watches grids, overrides prices and stock by hand, toggles automation flags. No login, no roles, no audit of *who* did what. |
| **Trendyol** | Marketplace. Provides a REST API for the seller's own listings. Competitor/buybox data is **not** in the API and is scraped from the public product page. |
| **Hepsiburada** | Marketplace. Provides REST APIs for listings, buybox ordering (competitor ranking) and orders. |
| **ERP / stock source** | An external MySQL database (`teyentegrasyon`) plus manually exported Excel files, providing physical stock quantity and unit cost per stock code. |
| **Farmazon / N11 / GittiGidiyor** | Legacy or partial integrations. See doc 04 §5. |

## 4. System context

```
                          ┌──────────────────────────────┐
     Excel: stock file ──▶│                              │
     Excel: product file ─▶│                              │
                          │        BuyBoxApp             │
   ERP MySQL              │   (WinForms desktop app,     │
   `teyentegrasyon` ─────▶│    single operator machine)  │
                          │                              │
                          └───┬───────────────┬──────────┘
                              │               │
                     read/write│               │read/write
                              ▼               ▼
                    ┌────────────────┐   ┌──────────────────────────┐
                    │ MySQL          │   │ Trendyol REST API        │
                    │ `buyboxapp`    │   │ + Trendyol product page  │
                    │ (state + much  │   │   (HTML/JSON scrape)     │
                    │  business      │   ├──────────────────────────┤
                    │  logic in      │   │ Hepsiburada REST APIs    │
                    │  stored funcs) │   │  listing / buybox / oms  │
                    └────────────────┘   └──────────────────────────┘
```

Key structural fact about the legacy system: **the MySQL database is not a passive store.**
A large fraction of the Hepsiburada pricing logic lives inside MySQL stored functions
(`sfGetHbLowestSellablePrice`, `sfGetHbChangedPrice`, `sfGetHbPriceWithoutExpenditure`, …)
that are invoked through views. The C# code and the SQL code implement *overlapping and
partially divergent* versions of the same formulas. Doc 02 reconciles them; the rewrite
must pick one home for this logic.

## 5. Deployment shape (as-is)

- One Windows executable, run manually by the operator.
- Long-running work executes in in-process `BackgroundWorker` threads that **restart
  themselves on completion**, producing an endless polling loop that lives only as long as
  the app window is open.
- No service, no scheduler, no server component, no multi-user support.
- Configuration is a mixture of `App.config` user settings (MySQL connection string only)
  and **constants hardcoded in source**, with `// TODO : Make these unhardcoded` comments.

## 6. Glossary

| Term | Meaning |
|------|---------|
| **Buybox** | The featured-offer slot on a marketplace product page. Winning it captures nearly all sales. |
| **Buybox order** | The ranked list of sellers on a product, best offer first. Hepsiburada exposes this via API; Trendyol only via the public page. |
| **Listing** | One sellable offer = (marketplace, marketplace SKU). Trendyol identifies by `barcode`; Hepsiburada by `HepsiburadaSku`. |
| **Product card** | Trendyol's term for a listing record returned by its API. |
| **Merchant SKU / Seller stock code** | The seller's own code for a listing, e.g. `12345-4`. Encodes the base product and the pack size. See doc 01 §2. |
| **Base stock code** | The part of a stock code before the first `-`. Identifies the physical product in the ERP. |
| **Multi-pack** | A listing that sells N units of one product, e.g. `12345-4` = 4 units of product `12345`. |
| **Bundle (paket ürün)** | A listing that sells a set of *different* products together. Stock code contains `k`/`K` after the dash, e.g. `12345-k2`. |
| **Unit price (birim fiyat)** | Our cost for the quantity contained in one listing, after applying the price multiplier. |
| **Original unit price (orj. birim fiyat)** | Cost without the price multiplier applied. |
| **Price multiplier (çarpan)** | Per-stock-code, per-marketplace factor that inflates or deflates the cost basis, used to force a wider margin on selected products. Default `1`. |
| **Lowest sellable price (dip fiyat)** | The selling price at which, after all deductions, net proceeds equal the unit price. The hard floor for the bot. |
| **Price without expenditure** | Net proceeds that reach the seller's account for a given selling price, after commission, cargo and expenditures. Inverse of the floor calculation. |
| **Basket discount / basket ratio** | Hepsiburada campaign where the customer pays less at checkout. `basketRatio = finalPrice / listingPrice`. The discount cost is split between store and marketplace by `StoreDebtAmount` %. |
| **Close-out (`isCloseOut`)** | State where the current selling price yields net proceeds *below* unit cost, i.e. we are selling at a loss. Triggers a price *increase*, regardless of buybox position. |
| **AutoBB** | The per-stock-code master switch enabling automated repricing. Separate flags exist for Trendyol (`Automated_Buybox`) and Hepsiburada (`HbAutomatedBuybox`). |
| **Increase/Decrease price flags** | Per-listing switches allowing the bot to raise-only or lower-only. Both default to true. |
| **Commission VAT multiplier** | `1.18`. Marketplace commission is quoted ex-VAT; the real deduction is commission × 1.18. |

## 7. Non-goals of the current system

These are explicitly *not* implemented and should be treated as new scope only if the
operator asks for them:

- Creating new listings or product content on any marketplace (partially stubbed for
  GittiGidiyor only, never completed).
- Order fulfilment, shipping label printing (a Trendyol label endpoint exists but its
  result is discarded), invoicing, or returns.
- Any reporting, dashboards, or historical analytics beyond raw change-log tables.
- Multi-store or multi-tenant operation.
