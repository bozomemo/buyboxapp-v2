# 04 — Marketplace Integrations

Every external interface the system speaks, with auth scheme, shape and known quirks.
**All credentials shown are redacted.** See doc 09 §1.

---

## 1. Trendyol REST API

Base: `https://api.trendyol.com/sapigw/suppliers/{supplierId}`

Auth: HTTP Basic, `base64(apiKey:apiSecret)`, plus a required
`User-Agent: {supplierId} - SelfIntegration` header. All requests are
`Content-Type: application/json`.

> The base path `sapigw` and the supplier-scoped route shape are the older generation of the
> Trendyol integration API. The rewrite should target the current Trendyol Seller API
> (`https://apigw.trendyol.com/integration/...` with seller-id scoping and bearer-style keys)
> and re-verify every field name — Trendyol has changed both the host and payload shapes since
> this code was written.

### 1.1 Get product card by barcode

```
GET /products?approved=true&barcode={barcode}
```

Response (fields the system actually uses):

```jsonc
{
  "page": 0, "size": 50, "totalElements": 1, "totalPages": 1,
  "content": [{
    "barcode": "...", "title": "...", "brand": "...", "categoryName": "...",
    "productMainId": "...",        // model code
    "productContentId": 123456789, // product page id -> used for scraping
    "stockCode": "12345-4",        // our seller stock code
    "quantity": 12,
    "salePrice": 149.90,
    "listPrice": 199.90,
    "vatRate": 10,
    "onSale": true, "approved": true, "rejected": false,
    "locked": false, "blacklisted": false,
    "rejectReasonDetails": [],
    "campaignStartDate": 1690000000000,   // epoch millis
    "campaignEndDate":   1699000000000,
    "campaignMaxPrice": 179.90,
    "hasActiveCampaign": true,
    "categoryMinPrice": 10.0, "categoryMaxPrice": 999.0,
    "createDateTime": 0, "lastPriceChangeDate": 0,
    "lastStockChangeDate": 0, "lastUpdateDate": 0,
    "stockUnitType": "Adet",
    "images": [{ "url": "https://..." }],
    "attributes": [{ "attributeId": 1, "attributeName": "...", "attributeValue": "..." }]
  }]
}
```

**Error handling (as-is):** any exception is logged and the method returns a synthetic
response containing one content item with `title = "Error"`. Callers detect the error by
comparing the title against the literal string `"Error"`. The rewrite must use a real result
type.

**Empty result:** `content` is an empty list when the barcode is unknown. Callers must check
`content.Count == 0` before indexing — several code paths do not.

### 1.2 Update price and inventory

```
POST /products/price-and-inventory
{
  "items": [
    { "barcode": "...", "quantity": 12, "salePrice": 149.90, "listPrice": 199.90 }
  ]
}
→ { "batchRequestId": "..." }
```

Constraint: **maximum 100 items per request** (the client returns `null` without calling if
exceeded). The current system always sends exactly one item per call — a significant
inefficiency; the rewrite should batch.

Three convenience wrappers exist that each read the current values from a product card and
change exactly one of them: `Update_price`, `Update_Quantity`, `Update_list_price`. All three
send all four fields, so a stale read overwrites the other two values.

### 1.3 Batch request result

```
GET /products/batch-requests/{batchRequestId}
→ { "batchRequestId": "...", "status": "...", "itemCount": n,
    "items": [{ "requestItem": { "product": {...} }, "status": "...", "failureReasons": [] }] }
```

**This endpoint is implemented but never called.** Price updates are fire-and-forget: the
system never verifies that a submitted price was accepted. **The rewrite must poll batch
results and surface failures**, otherwise rejected updates are invisible and the idempotency
gate believes a change happened.

### 1.4 Shipping label (unused)

```
POST /suppliers/{cargoTrackingNumber}/common-label/{supplierId}?format=ZPL   # note: args swapped
GET  /suppliers/{supplierId}/common-label/v2/{cargoTrackingNumber}
```

Both are implemented; the GET parses the response into a JSON object and then **discards it**,
returning an empty string. Dead code. The path parameters in the POST are transposed
(supplier id and tracking number swapped) — it cannot have worked.

### 1.5 Competitor data: HTML/JSON scraping

Trendyol's API does not expose buybox or competitor information, so the system loads the
public product page:

```
GET https://www.trendyol.com/marka/urun-p-{productContentId}
```

with cookies enabled, follows redirects, and records the final URL as the canonical product
link. It then:

1. Selects the first `<script>` element in `<body>` via XPath `/html/body/script[1]/text()`.
2. Finds the substring starting at `{"product"` and ending at the first `}};` (inclusive of
   two closing braces).
3. Parses that substring as JSON.

From the parsed object it reads:

| Path | Meaning |
|------|---------|
| `product.merchantListings[0]` | The buybox seller |
| `product.merchantListings[1..]` | Other sellers, in rank order |
| `…merchant.name` | Seller name (trimmed) |
| `…merchant.sellerScore` | Seller rating, `−1` when absent |
| `…promotions.length > 0` | Has a promotion |
| `…variants[0].price.discountedPrice` | Selling price |
| `…variants[0].price.couponApplicablePrice` | Basket-discount price |
| `…variants[0].quantity` | Offered stock (`0` when absent) |
| `product.ratingScore.totalCommentCount` | Comment count |
| `product.ratingScore.totalRatingCount` | Rating count |

Derived: `hasBasketDiscount = discountedPrice ≠ couponApplicablePrice`, and the discount label
`"Sepette %{round((1 − couponApplicable/discounted) × 100)} indirim"`.

An earlier, fully DOM-based implementation (CSS-class XPath selectors such as
`div[@class='product-price-container']`, `span[@class='prc-dsc']`, `div[@class='omc-cntr']`)
is still present but commented out. It documents the previous page structure and is dead.

**Risks and constraints, which the rewrite must confront directly:**

- The scrape is one full page load **per listing per cycle**, single-threaded per worker, with
  no rate limiting, caching, retry or backoff. This is the system's dominant cost and its
  main fragility.
- Any change to Trendyol's page structure, script ordering, or embedded JSON shape breaks
  competitor data silently — the parser throws, the exception is logged, and the listing is
  skipped.
- Scraping may conflict with Trendyol's terms of service. **Before rebuilding this, check
  whether Trendyol now offers a buybox/competitor endpoint on the Seller API.** If it does,
  use it. If it does not, the rewrite still needs an explicit decision from the business
  owner, plus rate limiting, a user-agent policy, caching, and graceful degradation when
  scraping is unavailable.

> ### ✅ Resolved in the rewrite (2026-08-13)
>
> Trendyol **does** now offer an official buybox endpoint (api-references §1.4), so the
> control path no longer scrapes at all — that was the structural single point of failure in
> doc 09 §22. Scraping survives only as **reporting**, and every risk listed above is
> answered by construction:
>
> | Legacy failure above | Rewrite |
> |---|---|
> | one page load per listing per cycle, no rate limit, cache, retry or backoff | token-bucket limiter, response cache, tiered frequency, per-run ceiling |
> | page-structure change breaks competitor data silently | balanced-brace parse of `__envoy__SHARED_PROPS` by marker, plus per-field diagnostics recorded on every run |
> | parser throws, listing silently skipped | typed `fetchFailed` / `parseFailed`, both recorded in `scrape_runs`, failure **rate** alerts |
> | terms-of-service question unanswered | the job ships **disabled**; an operator must switch it on |
>
> **The page structure documented above is obsolete.** `merchantListings[]` no longer exists;
> the current payload is a `merchantListing` *object* with the buybox seller stored separately
> from `otherMerchants[]`. Read
> [`trendyol-merchants-scraping-guide.md`](trendyol-merchants-scraping-guide.md) and
> api-references §1.6 — never this section — before changing the scraper.

---

## 2. Hepsiburada REST APIs

Auth for all three hosts: HTTP Basic, `base64(storeUsername:password)`,
`Accept: application/json`. The merchant id appears in the path.

### 2.1 List listings (paged)

```
GET https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}
    ?offset={n}&limit={pagingLimit}
```

Response:

```jsonc
{
  "totalCount": 1234,
  "listings": [{
    "hepsiburadaSku": "...", "merchantSku": "...",
    "price": 149.90, "availableStock": 12, "dispatchTime": 1,
    "cargoCompany1": "...", "cargoCompany2": "...", "cargoCompany3": "...",
    "shippingAddressLabel": "...", "claimAddressLabel": "...",
    "maximumPurchasableQuantity": 5, "minimumPurchasableQuantity": 1,
    "isSalable": true, "isSuspended": false, "isLocked": false, "isFrozen": false,
    "deactivationReasons": [], "lockReasons": [],
    "commissionRate": 16.0, "isFulfilledByHB": false,
    "pricings": [{
      "finalPrice": 129.90,
      "startDate": "...", "endDate": "...",
      "debtors": [{ "debtor": "Mağaza", "amount": 60 }]
    }]
  }]
}
```

Paging is **recursive**: after processing a page, if `offset + limit < totalCount` the method
calls itself with `offset + limit`. Page size is 100. Recursion depth therefore grows with
catalogue size — for a large catalogue this risks a stack overflow and should be a loop.

While paging, salable SKUs are collected in batches of 10 and passed to the buybox-orders
endpoint (§2.2).

Only the **first** pricing entry is persisted; multi-campaign listings lose all but one.

### 2.2 Buybox orders (competitor ranking)

```
GET https://listing-external.hepsiburada.com/buybox-orders/merchantid/{merchantId}
    ?skuList=sku1,sku2,...          # up to 10 SKUs per call
```

Response is a nested object whose first property's first property is a collection of variant
tokens; each token has a `sku` and a `buyboxOrders` array:

```jsonc
{ "<wrapper>": { "<wrapper>": [
    { "sku": "...", "buyboxOrders": [
        { "merchantName": "...", "merchantRating": 9.2, "price": 129.90, "dispatchTime": 1 },
        { "merchantName": "...", "merchantRating": 8.8, "price": 131.50, "dispatchTime": 2 }
    ]}
]}}
```

The whole variant token is stored verbatim as JSON text in `hbbuyboxorders.BuyboxOrders`, and
all subsequent access goes through MySQL `JSON_EXTRACT` inside stored functions
(`sfGetHbMerchantName`, `sfGetHbMerchantPrice`, `sfGetHbMerchantRating`,
`sfGetHbMerchantDispatchTime`), indexed by rank `0`, `1`, `2`.

Consequences: only the **top three** competitors are ever surfaced, and the ranking is only as
fresh as the last import. The rewrite should store competitor offers as rows, not JSON blobs.

### 2.3 Update listings (inventory upload)

```
POST https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}/inventory-uploads
Content-Type: (not set — see below)

<?xml version="1.0" encoding="utf-8"?>
<listings xmlns:xsi="..." xmlns:xsd="...">
  <listing>
    <HepsiburadaSku>...</HepsiburadaSku>
    <MerchantSku>...</MerchantSku>
    <ProductName></ProductName>
    <Price>149.90</Price>
    <AvailableStock>12</AvailableStock>
    <DispatchTime>1</DispatchTime>
    <MaximumPurchasableQuantity>5</MaximumPurchasableQuantity>
    <CargoCompany1>...</CargoCompany1>
    <CargoCompany2>...</CargoCompany2>
    <CargoCompany3>...</CargoCompany3>
  </listing>
  ...
</listings>

→ { "id": "<uploadId>" }
```

Notes and hazards:

- The XML is built by **string concatenation with no escaping**. A cargo company or SKU
  containing `&`, `<` or `>` produces malformed XML.
- `Price` is interpolated using the ambient culture. On a Turkish-locale machine a decimal
  comma would be emitted. Every numeric serialisation in the rewrite must be
  culture-invariant.
- `ProductName` is deliberately sent empty.
- The upload **replaces** the listing record, so every echoed field must be correct or data is
  lost.

### 2.4 Check upload status

```
GET https://listing-external.hepsiburada.com/listings/merchantid/{merchantId}/inventory-uploads/id/{uploadId}
```

Called immediately after the upload in one of the two overloads, and its result is
**discarded**. As with Trendyol, submissions are effectively unverified. The rewrite must
poll this until terminal state and record success/failure per listing.

### 2.5 Orders

```
GET https://oms-external.hepsiburada.com/orders/merchantid/{merchantId}
```

Response `{ "totalCount": n, "items": [ … ] }`. Per item the system reads: `orderNumber`,
`sku`, `merchantSKU`, `name`, `quantity`, `unitPrice.amount`, `totalPrice.amount`,
`hbDiscount.unitPrice.amount`, `hbDiscount.totalPrice.amount`, `commissionRate`, `vatRate`,
`deptorDifferenceAmount` (spelled that way by the API), `orderDate` (round-trip format),
`cargoCompanyModel.name`, `customerId`, `customerName`, `shippingAddress.*`,
`invoice.address.*`, `invoice.taxNumber`, `invoice.taxOffice`.

The call sends **no date filter** despite computing `beginDate = now − 1 day` and
`endDate = now` — the variables are never attached to the query string. Every run therefore
fetches whatever the default window is, and there is **no paging** even though `totalCount`
is read. Both are defects.

Import is destructive: both order tables are cleared for marketplace code `HB` before insert.

---

## 3. ERP / stock data sources

### 3.1 Stock Excel file

Chosen by the operator via a file dialog. Read with OLE DB
(`Microsoft.ACE.OLEDB.12.0`, `Excel 12.0 Xml;HDR=YES`), first non-`FilterDatabase` sheet.
Required columns:

| Column | Maps to |
|--------|---------|
| `KODU` | base stock code |
| `ADI` | product name |
| `Standart_Maliyet` | unit cost |
| `TOPLAM MIKTAR` | unit stock |

Each row is upserted into `stock_table`. On insert only, the multipliers default to `1`,
Trendyol automation defaults to on and Hepsiburada automation to off; on update only name,
price, stock and total selling stock are touched, preserving operator settings.

### 3.2 Product/commission Excel file

Read with EPPlus, worksheet must be named exactly `Ürünler`. Only three columns are used and
they are addressed **by position**:

| Index | Meaning |
|-------|---------|
| 0 | (unused) |
| 1 | barcode |
| 2 | commission rate |

This table also drives the full-catalogue refresh: the refresh workers iterate its rows.

> The ACE OLE DB provider is a 32/64-bit-sensitive native dependency and a deployment
> liability. The rewrite should use a managed spreadsheet reader, or better, replace both
> files with a direct ERP query.

### 3.3 ERP MySQL (bundles)

A second, **separately hardcoded** connection string points at database `teyentegrasyon` on
the same server with a different user. Used only by the bundle refresh:

```sql
SELECT * FROM teyentegrasyon.tblteystoklar WHERE stokKodu LIKE '%-k%';
SELECT * FROM teyentegrasyon.tblstokbagliurunler WHERE stokID = '<id>';
```

Columns used: `stokKodu`, `stokID`, `stokERPAdi`, `pyUrunKodu`, `pyUrunAdi`.

---

## 4. Local database

MySQL, database `buyboxapp`, accessed with ADO.NET (`MySql.Data` 8.0.27). Connection string
is stored in per-user .NET settings and editable in the UI. See doc 05.

---

## 5. Legacy / excluded integrations

These exist in the source and are **explicitly out of scope for the rewrite**. Documented
only so nothing is lost.

### 5.1 Farmazon (partial)

Token-based REST at `https://lab.farmazon.com.tr/api/v1`.

- `POST /account/signin` with form fields `username`, `password`, `clientName`,
  `clientSecretKey` → `{ result: { token, tokenExpireDate } }`. The token is cached and
  refreshed when expired; requests carry `Authorization: Bearer <token>`.
- `GET /listings/getlistings?page&count&listingState` — `listingState` 1 = active, 2 = passive.
  Recursive paging; after exhausting active listings it restarts at page 1 for passive ones.
  Each listing is upserted into `farmazon_listings`.
- `GET /orders/getsoldorders?page&count&orderState` and `GET /orders/getsoldorder?orderId` —
  implemented, but the response-handling loops have **empty bodies**. No orders are stored.

No pricing, no updates, no buybox. Import only.

### 5.2 N11 (stub)

SOAP via generated web references `N11ProductService` and `N11ProductStockService`
(`https://api.n11.com/ws/productService/`, `.../productStockService/`), authenticated with
`appKey`/`appSecret`. Only `GetProductList` and `GetProductByProductId` are wired, and the
result-processing loop is an empty body marked `// TODO : Fill after doing gittigidiyor`.
Nothing is persisted.

### 5.3 GittiGidiyor (dead)

Hand-built SOAP envelopes against `dev.gittigidiyor.com` (note: the **dev** host, never
switched to production), with an MD5 signature `MD5(apiKey + secretKey + epochMillis)` in
uppercase hex plus HTTP Basic role credentials.

Implemented: `getParentCategories`, `getSubCategories` (recursively walked into
`ggcategories` / `ggcategoryspecs`), `getProducts`, `getProduct`.
`insertAndActivateProduct` exists as a template full of literal `?` placeholders and **builds
a string it never sends**.

The platform was shut down in Turkey. Drop entirely; the `ggcategories` and `ggcategoryspecs`
tables can be deleted.
