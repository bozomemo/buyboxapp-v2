# Marketplace API Reference

**Rule: before writing or changing any code that calls a marketplace API, find the endpoint
below and open its official documentation link.** Vendor docs are the only source of truth.
After verifying, update the entry and its "verified" date.

Legend: ✅ verified against official docs · ⚠️ needs verification · ❌ retired

---

# 1. Trendyol

Official documentation index: <https://developers.trendyol.com/v2.0/llms.txt>
(A machine-readable list of every documentation page. Start here when looking for an endpoint
not listed below.)

## 1.1 Environments

| Environment | Base URL |
|-------------|----------|
| Production | `https://apigw.trendyol.com/integration` |
| Stage | `https://stageapigw.trendyol.com/integration` |

❌ **Retired:** `https://api.trendyol.com/sapigw/suppliers/{supplierId}/…` — the host and path
scheme used by the legacy application. Do not use it as a reference.

Paths follow `{base}/{domain}/sellers/{sellerId}/…` where domain is `product`, `inventory`,
`order`, `finance`, etc.

## 1.2 Authentication ✅ *(verified 2026-08-12)*

Docs: <https://developers.trendyol.com/v2.0/docs/authorization>

- HTTP Basic: username = API Key, password = API Secret Key.
- Credentials are obtained from the seller panel → Hesap Bilgilerim → Entegrasyon Bilgileri,
  by the master user only. They differ per environment.
- **`User-Agent` header is mandatory.** Missing it returns **403**.
  - Self-integrated: `{sellerId} - SelfIntegration`
  - Via an integrator: `{sellerId} - {IntegratorName}` (alphanumeric, max 30 chars)

## 1.3 Rate limits ✅ *(verified 2026-08-12)*

Docs: <https://developers.trendyol.com/v2.0/docs/1-service-limitations>

- **50 requests per endpoint per 10 seconds.** Exceeding returns **429**.
- Per-minute quotas apply **per service group, shared across all endpoints in the group**, and
  scale with the seller's listing limit tier (50K / 75K / 150K / 500K / unlimited):

| Group | Requests per minute |
|-------|---------------------|
| Product Integration Read (filter, batch results, brand/category, attributes) | 1,000 → 2,000 |
| Product Integration Write (create/update/delete, archive, unlock, **buybox check**) | 200 → 600 |
| Inventory & Price Write | 350 → 2,000 |
| Get Shipment Packages | 30 → 100 |
| Common Labels | 100 |
| Finance | 100 |

> The Inventory & Price Write quota is the practical ceiling on repricing throughput. Size the
> repricing loop against the seller's actual tier.

## 1.4 Endpoints

### Product filter — approved products (V2) ✅ *(verified 2026-08-12)*

Docs: <https://developers.trendyol.com/v2.0/docs/product-filtering-approved-products-v2>
Reference: <https://developers.trendyol.com/v2.0/reference/filterapprovedproducts>

```
GET /product/sellers/{sellerId}/products/approved
```

**This is the primary listing-import endpoint.** It is the only product endpoint that returns
both `commission` and `vatRate`, which the cost model requires.

Query parameters: `barcode`, `barcodes` (max 50), `startDate`, `endDate`, `page`,
`size` (max 100), `dateQueryType` (`VARIANT_CREATED_DATE` | `VARIANT_MODIFIED_DATE` |
`CONTENT_MODIFIED_DATE`), `supplierId`, `stockCode`, `origin`, `productMainId`, `brandIds`,
`status` (`archived` | `blacklisted` | `locked` | `onSale` | `notOnSale`), `contentId`,
`orderByDirection` (`ASC` | `DESC`), `nextPageToken`.

Paging: `page × size` must not exceed 10,000. Beyond that, use `nextPageToken` from the
previous response.

Response — product level: `contentId`, `productMainId`, `brand{id,name}`,
`category{id,name}`, `creationDate`, `lastModifiedDate`, `lastModifiedBy`, `title`,
`description`, `images[]`, `attributes[]`, `variants[]`.

Response — variant level (the fields the system consumes):

| Field | Meaning |
|-------|---------|
| `barcode` | Listing identity |
| `commission` | **Commission percentage for this variant** — e.g. `7.83` |
| `vatRate` | **Product VAT rate** — 1, 10 or 20 |
| `price.salePrice` | Our current selling price (VAT-inclusive) |
| `price.listPrice` | Reference / strike-through price |
| `price.priceSeenByCustomer` | **Final checkout price after all campaigns and coupons** |
| `stock.quantity` | Offered stock |
| `stockCode` | Our seller stock code |
| `productUrl` | Public product page URL (includes contentId and merchantId) |
| `onSale` | Listing is live |
| `channels[]` | `CORE` and/or `LUXE` |
| `deliveryOptions` | `deliveryDuration`, `isRushDelivery`, `fastDeliveryOptions[]` |
| `origin` | Country of origin |
| `locked`, `lockReason`, `lockDate` | Lock state |
| `archived`, `archivedDate` | Archive state |
| `blacklisted`, `hasViolation`, `docNeeded` | Compliance flags |
| `variantId`, `supplierId`, `sellerCreatedDate`, `sellerModifiedDate` | Metadata |

> `priceSeenByCustomer` vs `salePrice` gives the campaign discount natively. The legacy system
> derived this ratio from scraped data; do not reproduce that.

### Product filter — stock and price only ✅ *(verified 2026-08-12)*

Reference: <https://developers.trendyol.com/v2.0/reference/filterapprovedproductsinventoryandprice>

```
GET /product/sellers/{sellerId}/products/approved/inventory-and-price
```

Lighter payload for frequent polling: `variantId`, `barcode`, `salePrice`, `listPrice`,
`quantity`, `stockCode`, `stockLastModifiedDate`. **Does not include `commission` or
`vatRate`** — use the full filter above for those.

Query parameters: `barcode`, `barcodes` (max 50), `contentId`, `stockCode`, `productMainId`,
`status`, `page`, `size` (max 100), `orderByDirection`, `nextPageToken`.

### Buybox check ✅ *(verified 2026-08-12)*

Docs: <https://developers.trendyol.com/v2.0/docs/product-buybox-check-service-1>
Reference: <https://developers.trendyol.com/v2.0/reference/getbuyboxinformation>

```
POST /product/sellers/{sellerId}/products/buybox-information
{ "barcodes": ["1111111111111", "2222222222"] }
```

**Maximum 10 barcodes per request. Rate limit 1,000 requests/minute.**

```jsonc
{
  "buyboxInfo": [{
    "barcode": "1111111111111",
    "buyboxOrder": 1,          // our rank; 1 = we hold the buybox
    "buyboxPrice": 600,        // price of the rank-1 offer
    "hasMultipleSeller": false,
    "secondBuyboxPrice": 2999, // price of the rank-2 offer
    "thirdBuyboxPrice": 3199   // price of the rank-3 offer
  }]
}
```

> **This is the control-loop data source.** Our rank plus the top three prices is everything the
> repricing state machine needs. It does **not** return competitor names, ratings or stock —
> those come from the reporting scrape (§1.6) and must never be on the critical path.

### Stock and price update ✅ *(verified 2026-08-12)*

Docs: <https://developers.trendyol.com/v2.0/docs/stock-and-price-update-updatepriceandinventory-1>
Reference: <https://developers.trendyol.com/v2.0/reference/updatepriceandinventory>

```
POST /inventory/sellers/{sellerId}/products/price-and-inventory
{ "items": [ { "barcode": "...", "quantity": 12, "salePrice": 149.90, "listPrice": 199.90 } ] }
→ { "batchRequestId": "fa75dfd5-6ce6-4730-a09e-97563500000-1529854840" }
```

Constraints:
- **Maximum 1,000 items per request** (the legacy code sent 1 item per call).
- Maximum 20,000 stock per product.
- **The same request cannot be repeated within a 15-minute window.**
- `quantity`, `salePrice` and `listPrice` are individually optional; send only what changes.

### Batch request result ✅ *(verified 2026-08-12)*

Reference: <https://developers.trendyol.com/v2.0/reference/getbatchrequestresult>

```
GET /product/sellers/{sellerId}/products/batch-requests/{batchRequestId}
```

Response: `batchRequestId`, `status` (`COMPLETED` | `IN_PROGRESS`), `batchRequestType`
(`ProductV2OnBoarding` | `ProductV2Update` | `ProductInventoryUpdate` |
`ProductArchiveUpdate` | `ProductDeletion`), `itemCount`, `failedItemCount`, `creationDate`,
`lastModification`, `sourceType` (`API` | `WEB`), `items[]` where each item has
`requestItem`, `status` (`SUCCESS` | `FAILED`), `failureReasons[]`.

> **Results are retained for only 4 hours after completion.** The confirmation job must reach a
> terminal state inside that window or the outcome is lost. Every submission must be confirmed
> here before its audit record is written.

### Finance — settlements ⚠️

Docs: <https://developers.trendyol.com/v2.0/docs/current-account-statement-integration>
Reference: <https://developers.trendyol.com/v2.0/reference/getsettlements>

Actual commission, cargo and deduction amounts on real sales. Rate limit 100 req/min.
**Use this to validate the cost model against reality** (doc 11, N-12).

Also: <https://developers.trendyol.com/v2.0/reference/getotherfinancials> and
<https://developers.trendyol.com/v2.0/reference/getcargoinvoiceitems> (real cargo invoice
amounts — the authoritative source for cargo band configuration).

### Orders ⚠️ *(only if order import is implemented — currently MAY-ADD-LATER)*

- Get shipment packages: <https://developers.trendyol.com/v2.0/reference/getshipmentpackages>
  (rate limit 30–100 req/min)
- Cursor/stream variant: <https://developers.trendyol.com/v2.0/reference/getshipmentpackagesstream>

### Webhooks ⚠️ *(not used yet — evaluate before building order polling)*

<https://developers.trendyol.com/v2.0/docs/webhook-model> ·
[create](https://developers.trendyol.com/v2.0/reference/createwebhook) ·
[list](https://developers.trendyol.com/v2.0/reference/getwebhooks) ·
[update](https://developers.trendyol.com/v2.0/reference/updatewebhook) ·
[delete](https://developers.trendyol.com/v2.0/reference/deletewebhook)

Trendyol supports webhooks. Prefer them over polling for order events.

### Other useful endpoints

| Purpose | Link |
|---------|------|
| API health check | <https://developers.trendyol.com/v2.0/docs/api-status> |
| Category tree | <https://developers.trendyol.com/v2.0/reference/getcategorytree> |
| Brand list | <https://developers.trendyol.com/v2.0/reference/getbrands> |
| Changelog — **check periodically** | <https://developers.trendyol.com/v2.0/changelog/changelog> |

## 1.5 Trendyol data coverage summary

| The system needs | Source | Official API? |
|------------------|--------|---------------|
| Our listings, prices, stock | product filter (approved, V2) | ✅ |
| Commission rate | product filter (approved, V2) → `commission` | ✅ |
| Product VAT rate | product filter (approved, V2) → `vatRate` | ✅ |
| Campaign / checkout price | product filter → `priceSeenByCustomer` | ✅ |
| Our buybox rank | buybox check → `buyboxOrder` | ✅ |
| Buybox, 2nd, 3rd competitor prices | buybox check | ✅ |
| Competitor **names** | — | ❌ scrape |
| Competitor **ratings** | — | ❌ scrape |
| Competitor **stock** | — | ❌ scrape |
| Full seller list beyond rank 3 | — | ❌ scrape |
| Real commission/cargo charged | finance settlements | ✅ |

## 1.6 Public product-page data (reporting only) ⚠️ *(shape supplied 2026-08-13)*

Used exclusively to build the competitor history required for reporting: seller names,
ratings, stock and the full seller list. **It must never gate a pricing decision** — if it
fails, repricing continues on official buybox data alone and an alert is raised.

> **Full extraction specification: [`trendyol-merchants-scraping-guide.md`](trendyol-merchants-scraping-guide.md).**
> That document is the authority on the payload's structure, its field-level pitfalls and the
> normalisation rules. This section records only the request shape and the operating
> constraints. Read the guide before touching `packages/adapters/src/trendyol/public-page/`.

### Request

```
GET https://www.trendyol.com/marka/urun-p-{contentId}
Accept: text/html
User-Agent: <identifies this client; see "Operating constraints" below>
```

Redirects are followed; the final URL is the canonical product link. `productUrl` on each
variant of the product filter (§1.4) is preferred when the import captured one — it is
Trendyol's own canonical link. **This is a plain HTML GET; there is no JSON API and no
browser automation is needed** — the whole application state is embedded in the response.

### Response

The data is the JSON assigned to `window["__envoy__SHARED_PROPS"]` inside a `<script>` in the
initial HTML. Locate the script **by that marker**, then read a **balanced** `{…}` object
honouring JSON string literals. (The legacy system took `/html/body/script[1]` and cut to the
first `}};` — both break silently; see doc 04 §1.5 and doc 09 §22.)

Structure actually consumed:

| Path | Meaning |
|------|---------|
| `$.product.id`, `$.product.productCode` | Product page identity |
| `$.product.merchantListing.merchant` | The **buybox seller's identity** — `id`, `name`, `sellerScore.value` |
| `$.product.merchantListing.winnerVariant` | The buybox seller's **offer** — `listingId`, `barcode`, `price`, `quantity`, stock flags |
| `$.product.merchantListing.promotions[]` | Buybox seller's promotions |
| `$.product.merchantListing.otherMerchants[]` | Competing sellers; each carries `variants[]` with its own `listingId` and `price` |

Four things the shape gets wrong if assumed rather than read:

1. **`merchantListing` is an object, not an array.** Iterating it iterates keys. The legacy
   `merchantListings[0]` / `[1..]` model no longer exists.
2. **The buybox seller is stored separately from `otherMerchants` and must be joined** from
   `merchant` + `winnerVariant`, or it is lost entirely — including from the seller count.
3. **One merchant may expose several `variants[]`**, so merchant count and listing count are
   different numbers.
4. **Prices are `{ value, text }` and only `value` is data.** `text` is locale-formatted
   (`"35.010 TL"` is 35 010 ₺ in tr-TR) and `rrp.text` is known to be `"NaN TL"` with no
   numeric sibling, which must normalise to `null`.

`value` is in **lira** and is converted to exact kuruş once, at the adapter boundary.

### Operating constraints — all mandatory

| Constraint | Where it lives |
|---|---|
| Rate limiting, independent of the Seller API limiters | `TrendyolPublicPageSource` (30 req/min, burst 5 — doc 08) |
| Caching of identical requests | same, 10-minute TTL keyed by resolved URL |
| Tiered polling by listing importance | `ScrapeCompetitors` (doc 07 §4, §7) |
| Honest `User-Agent`, never a browser impersonation | `SCRAPER_USER_AGENT` (doc 08) |
| Graceful degradation | typed `fetchFailed`/`parseFailed`; repricing unaffected (doc 12 Phase 7 DoD) |
| **An explicit business decision to permit it** | `ScrapeCompetitors` is **off by default** and must be switched on by an operator |

⚠️ **Terms of service.** Scraping may conflict with Trendyol's terms. That decision is the
product owner's, and the system is built so that declining to make it costs nothing but
competitor reporting: the job ships disabled, and nothing in the pricing path reads its output.

⚠️ **This is an undocumented internal frontend payload, not a supported API.** It can change
without notice. `packages/adapters` records `parserVersion` and per-field diagnostics on every
scrape so a change surfaces as a metric, not as quietly empty reports. Re-verify this section
whenever the parser's diagnostics show a drop in `winnerVariantFound` or `merchantCount`.

---

# 2. Hepsiburada

Official documentation: <https://developers.hepsiburada.com/>

⚠️ **Partially verified.** The developer portal rejects automated access (HTTP 403). This
section is compiled from the product owner's portal research
(`Hepsiburada Marketplace Integration — Required Developer Portal Information.md`) plus the
legacy implementation. Items marked 🔴 must be copied from the live portal before the schema
is frozen — see §2.9.

## 2.1 Hosts — one per integration domain ✅

**Do not define a single global Hepsiburada base URL.** Each domain has its own host, and the
SIT host becomes the production host by removing `-sit`.

| Domain | SIT | Production |
|--------|-----|------------|
| Listings & inventory | `https://listing-external-sit.hepsiburada.com` | `https://listing-external.hepsiburada.com` |
| Orders | `https://oms-external-sit.hepsiburada.com` | `https://oms-external.hepsiburada.com` |
| Catalogue / product master data | `https://mpop-sit.hepsiburada.com` | `https://mpop.hepsiburada.com` |

The adapter must hold base URLs **per service group**, and rate-limit each group
independently (§2.2).

## 2.2 Authentication ✅

- HTTP Basic: `Authorization: Basic base64(username:password)`.
- **`User-Agent` is required** for Listing and Orders APIs.
- `Accept: application/json`, `Content-Type: application/json` — except catalogue product
  submission, which uses a JSON file via `multipart/form-data`.
- `merchantId` is a path parameter on most merchant-scoped endpoints; obtained from merchant
  integration configuration / the Merchant Portal.
- Test credentials are issued by Hepsiburada during onboarding and differ from production.

🔴 Exact `User-Agent` convention and the service-key ownership model still need confirmation.

## 2.3 Rate limits and quotas ✅ — **these constrain the repricing design**

| Domain | Limit |
|--------|-------|
| Catalogue API | 180 requests / minute / IP |
| Orders API | 1,000 requests / second (SIT and production) |
| Listing inventory update — batch size | **≤ 4,000 listings per request** |
| Listing inventory update — concurrency | **≤ 5 simultaneous pending/processing uploads** |
| Listing inventory update — daily allowance | **10 × the merchant's listing count, per day** |

Orders responses carry rate-limit metadata that the adapter **must** honour in preference to a
static client-side limit:

```
X-RateLimit-Remaining   requests left in the current window
X-RateLimit-Limit       maximum requests in the window
X-RateLimit-Reset       seconds until the window resets
```

Exceeding a limit returns `429 Too Many Requests`. Exceeding the upload concurrency returns:

```
There are too many ongoing/waiting inventory uploads at the moment. Please try again later.
```

> ### Design consequence — read this before building the repricing loop
>
> The daily allowance of **10 × listing count** is a hard budget. A catalogue of 1,000
> listings permits 10,000 listing updates per day, total.
>
> A loop that reprices every listing on every cycle exhausts this almost immediately. The
> `OPTIMUM` hold state in `docs/03-repricing-engines.md` is therefore not merely an
> optimisation — it is **required for the integration to function at all**. The legacy
> system's price ratchet (doc 09 §3) would have burned the entire daily quota continuously.
>
> The worker must track daily consumed updates per marketplace, reserve headroom, and
> prioritise listings by expected value when the budget runs low.

## 2.4 Listing service — list / filter listings 🔴

Portal path: **Listing ve Satışa Açma → Listeleme → Listing Bilgilerini Sorgulama**

This is the authoritative source for the merchant's **commercial listing state** (price,
stock, sale state, merchant SKU, commission), as distinct from the Catalogue API which carries
product master data.

Legacy call (unverified, likely still valid in shape):

```
GET {listing-host}/listings/merchantid/{merchantId}?offset={n}&limit={size}
GET {listing-host}/listings/merchantid/{merchantId}?hbskulist=sku1,sku2,...
```

Legacy response fields consumed: `hepsiburadaSku`, `merchantSku`, `price`, `availableStock`,
`dispatchTime`, `cargoCompany1..3`, `shippingAddressLabel`, `claimAddressLabel`,
`maximumPurchasableQuantity`, `minimumPurchasableQuantity`, `isSalable`, `isSuspended`,
`isLocked`, `isFrozen`, `isFulfilledByHB`, `deactivationReasons[]`, `lockReasons[]`,
`commissionRate`, `pricings[]` (`finalPrice`, `startDate`, `endDate`,
`debtors[{debtor, amount}]`).

🔴 **The complete query parameter set and response schema must be copied from the portal and
must not be inferred from the list above.** Persist every field returned, not only the ones
the pricing model needs today.

## 2.5 Buybox rank 🔴

Portal path: **Buybox Sırasını Getirme**

Important correction to earlier assumptions: Hepsiburada documents a **buybox ranking**
capability, not a service canonically named "Buybox Orders". The legacy endpoint

```
GET {listing-host}/buybox-orders/merchantid/{merchantId}?skuList=a,b,c     ⚠️ legacy, max 10 SKUs
```

returned a ranked `buyboxOrders[]` with `merchantName`, `merchantRating`, `price`,
`dispatchTime` per competitor. Whether this endpoint still exists under that name, and what
its current response is, 🔴 must be confirmed.

If it does still return competitor names and ratings, Hepsiburada gives **richer competitor
data than Trendyol**, and no scraping is required on this marketplace.

## 2.6 Inventory & price update ✅ flow, 🔴 schema

Portal path: **Listing Envanter Güncelleme** → **Listing Envanter Güncelleme Sorgulama**

Asynchronous, batch-oriented. Mandatory flow:

```
1. Build the batch (≤ 4,000 listings)
2. POST to the listing inventory update endpoint
3. Store the returned inventoryUploadId
4. Poll the status endpoint
5. Inspect per-item success/failure
6. Retry or surface rejected records
```

**An accepted HTTP response is not proof that the listings were updated.** Changes stay
`pending` until the status endpoint confirms them.

Legacy submission (XML body, unverified — 🔴 confirm whether JSON is now expected):

```
POST {listing-host}/listings/merchantid/{merchantId}/inventory-uploads
→ { "id": "<inventoryUploadId>" }
```

Status check ✅:

```
GET {listing-host}/listings/merchantid/{merchantId}/inventory-uploads/id/{inventoryUploadId}
Auth: Basic · Required header: User-Agent
```

🔴 The canonical batch status enum and the item-level failure schema are **not** publicly
indexed. Do not hard-code status names until they are copied from the portal or observed in
SIT. The connector's own state machine should distinguish at least: `submitted`, `pending`,
`processing`, `completed`, `partiallyFailed`, `failed`.

### Business validation failures — do not retry blindly ✅

| Error | Meaning |
|-------|---------|
| `OutOfPriceRange` | The proposed price is outside Hepsiburada's permitted range derived from market prices. A business rule; the merchant cannot disable it. |
| `DiscountedListingPriceIncrease` | Price increase rejected because the listing is in a campaign |
| `DiscountedListingStockDecrease` | Stock decrease rejected because the listing is in a campaign |
| `There are too many ongoing/waiting inventory uploads…` | Concurrency limit (5) exceeded — back off |
| `…exceeds his inventory upload limit` | Daily allowance exceeded — stop for the day |

`OutOfPriceRange` in particular must be treated as a **permanent business rejection**, surfaced
to the operator, and must feed back into the engine as a constraint on that listing's price
range — not retried. Retain the raw code and message for diagnosis.

## 2.7 Commission and VAT ✅

Two distinct sources:

| Source | Gives |
|--------|-------|
| **Listing integration** — `commissionRate`, plus the dedicated **Komisyon Bilgisi Sorgulama** service (introduced October 2025) | Commission *before* a sale — what the pricing model needs |
| **Orders integration** — `commission.amount`, `commission.currency`, `commissionRate`, `vat`, `vatRate` | Actual commission and VAT charged *on a real sale* — the ground truth for validating the cost model |

🔴 Obtain the Komisyon Bilgisi Sorgulama request/response schema. Confirm whether product VAT
rate is exposed on listings, or only on orders — the pricing model needs it pre-sale
(see `docs/02-cost-and-price-model.md`).

## 2.8 Orders 🔴 *(MAY-ADD-LATER — see doc 11 Q-10)*

```
GET {oms-host}/orders/merchantid/{merchantId}?begindate=&enddate=&offset=&limit=
```

- `limit` is **required**, maximum 100.
- `offset`/`limit` paging: `offset=20&limit=10` skips 20 and returns the next 10.
- Order lifecycle stages have **separate endpoints** (open/paid, packages, cancelled, shipped,
  delivered, undelivered, unpacked). Several expose only the **last one month** and cap `limit`
  at 50.
- Which endpoint to use depends on the merchant's automatic-packaging setting:
  - disabled → *Ödemesi Tamamlanmış Siparişler*
  - enabled → *Paket Bilgilerini Listeleme*

Documented fields include `items.id`, `orderId`, `orderNumber`, `orderDate`, `quantity`,
`merchantId`, `totalPrice{currency,amount}`, `unitPrice{currency,amount}`, `vat`, `vatRate`,
`customerName`, `status`, `shippingAddress`, `name`, `merchantSku`, `properties`,
`commission{currency,amount}`, `commissionRate`, `unitHBDiscount.amount`,
`totalHBDiscount.amount`, `merchantUnitPrice`, `merchantTotalPrice`, `cargoPaymentInfo`,
`customizedText01..03`.

Import strategy: watermark-based incremental sync with an overlap window, deduplicated on
Hepsiburada's immutable order/line identifiers. Never re-import full history.

> The legacy implementation sent **no date filter and did no paging**, while deleting all
> stored orders before each import (doc 09 §14). Do not reproduce this.

## 2.9 Outstanding confirmations 🔴

Copy from the live portal before freezing the adapter schema:

- [ ] Production URLs for every API group used
- [ ] Authentication username / service-key ownership model
- [ ] Exact required `User-Agent` convention
- [ ] Listing Information — full query parameters
- [ ] **Listing Information — full response JSON schema**
- [ ] Inventory/price update — exact request schema (JSON or XML?)
- [ ] Inventory batch accepted-response schema
- [ ] **Inventory upload status — canonical enum values**
- [ ] **Batch item-level failure schema**
- [ ] Komisyon Bilgisi Sorgulama — request/response schema
- [ ] Buybox Sırasını Getirme — endpoint, limits, response schema; does it return competitor
      names and ratings?
- [ ] Whether product VAT rate is available pre-sale on listings
- [ ] Orders — full response schema, and the merchant's automatic-packaging mode

Portal pages to attach: Başlarken · API Authentication · Listing Bilgilerini Sorgulama ·
Listing Envanter Güncelleme · Listing Envanter Güncelleme Sorgulama · Buybox Sırasını Getirme ·
Sipariş Entegrasyonu Önemli Bilgiler · Ödemesi Tamamlanmış Siparişleri Listeleme ·
Paket Bilgilerini Listeleme · Komisyon Bilgisi Sorgulama · Changelog.

## 2.10 Adapter structure

Rate-limit and configure each client independently:

```
HepsiburadaAdapter
├── auth
├── CatalogueClient   product master data            (180 req/min/IP)
├── ListingClient     list · inventory update · poll · commission lookup
├── BuyboxClient      buybox rank
└── OrdersClient      paid/open · packages · cancelled · shipped · delivered · undelivered
```

## 2.11 Public product listings (reporting only) 🟡 — **verified 2026-08-13, undocumented endpoint**

Unlike Trendyol (§1.6), this is **not a page scrape**: Hepsiburada's product page calls a public
JSON endpoint, and that endpoint is what we read. It is nonetheless undocumented and
unsupported — the same reporting-only rules apply in full, and nothing on the pricing path may
depend on it.

Verified by direct request on 2026-08-13 against SKU `BS1372` (an A4Tech XL-750BH mouse). The
response is recorded verbatim as
`packages/adapters/src/hepsiburada/fixtures/public-listings-BS1372.json` and every assertion in
`public-listings/public-listings.test.ts` runs against it.

### Request

```
GET https://www.hepsiburada.com/api/v1/product/listings/{sku}
```

`{sku}` is the **product** SKU (`BS1372`), shared with competitors — not our listing id. No
credential, no cookie and no session are required: the verification request sent none and
received a 200.

The endpoint sits behind Akamai bot protection and answers only a browser-shaped request.
Measured header by header — each row is a separate observed result, not an assumption:

| Request | Result |
|---|---|
| `User-Agent: BuyBoxApp/1.0 …` (our honest agent) + every other header below | **403** |
| Chrome `User-Agent` + `Accept` only | **403** |
| Chrome `User-Agent` + `Accept` + `Referer` | **403** |
| Chrome `User-Agent` + `Accept` + `Sec-Fetch-*` | **403** |
| Chrome `User-Agent` + `Accept` + `Accept-Language` + `Sec-Fetch-Dest/Mode/Site` + `Referer` | **200** |
| …the same set minus `Referer` | **403** |
| …the same set minus `Accept-Language` | **403** |

So the accepted set is exactly:

```
User-Agent:      <current browser UA>
Accept:          application/json, text/plain, */*
Accept-Language: tr-TR,tr;q=0.9
Sec-Fetch-Dest:  empty
Sec-Fetch-Mode:  cors
Sec-Fetch-Site:  same-origin
Referer:         <the product page on www.hepsiburada.com>
```

⚠️ **This is browser impersonation**, which doc 04 §1.5's user-agent policy otherwise forbids
and which the Trendyol source does not do. It is an exception granted explicitly by the product
owner on 2026-08-13 because the endpoint admits no honest alternative. It lives in
`SCRAPER_BROWSER_USER_AGENT` (doc 08 §12) so it is visible in deployment configuration rather
than buried in code, and `ScrapeCompetitors` still ships disabled.

⚠️ **Rate.** Roughly eight requests in quick succession tripped a temporary block, after which
even a previously-accepted request returned 403. The configured sustained rate is therefore
10/min with a burst of 3 — well under the observed threshold, and far stricter than Trendyol's.

### Response

`{ statusCode, redirection: { url, type, message }, data: { listings: [...] } }` — 10 sellers
for the verified SKU. `data.listings` is a **real array** and the buybox holder is inside it,
marked `buyboxOrder: 1`; there is no separately-stored winner to join, and none of §1.6's traps
apply here.

| Field | Meaning | Mapped to |
|---|---|---|
| `buyboxOrder` | 1-based buybox position | `rank`, `isWinner` |
| `merchantId` | merchant GUID — **the identity** | `sellerRef` |
| `merchantName` | display name, e.g. `Nethouse` | `sellerName` (data, never a key) |
| `listingId` | the seller's own offer id, a different GUID | `listingRef` |
| `price.value` | selling price in **lira** | `price` (→ kuruş) |
| `originalPrice.value` | list price before discount | — |
| `quantity` | offered stock | `offeredStock` |
| `isSalable` | false ⇒ zero stock regardless of `quantity` | `offeredStock` |
| `shipmentDay` + `shipmentType` | dispatch time and **its unit** | `dispatchTime`, only when the unit is `businessDays` |
| `ratingSummary.lifetimeRating` | seller score, 0–10 | `sellerRating` |
| `campaignIds`, `discountRate` | structural promotion signals | `hasPromotion` |
| `merchantInfo` | duplicate of id/name/rating | fallback only |

**The price unit is not a judgement call here**, unlike §1.6: the payload carries
`prices[0].formattedPrice: "1.379,00"` next to `price.value: 1379`, which in tr-TR fixes `value`
as lira. Conversion to kuruş happens once, through a decimal string.

`vatExcludedPrice` is present but is a *competitor's* VAT-excluded price and has no role in our
cost model (doc 02) — it is not read.

### Still unconfirmed — do not build on these without checking

- **`minimumPrice` / `minimumPrices`.** Keyed `"10"`, `"30"`, `"non-segmented-price"`. Almost
  certainly customer-segment pricing, but which audience each segment addresses is unknown, so
  none of them is mapped to `finalPrice` — a competitor's final price is reported as unknown
  rather than guessed.
- **`quantity` may be capped.** Several sellers report exactly `100`. It is stored as reported
  and used as a stock signal for nothing.
- **`price.currency`.** Only ever observed as `0`. The enum is not read or acted on.
- **Unknown or delisted SKU.** Not established: the attempt to test one coincided with the rate
  block above, so the 403 received cannot be attributed. The parser treats a missing `listings`
  as an honest zero rather than an error, which is safe either way.
- **The `Referer` fallback.** When a listing carries no captured product URL the source uses
  `https://www.hepsiburada.com/p-{sku}`. That form was **not** verified as an accepted referer
  and is the first thing to check if 403s appear.
- **Terms of service.** As with §1.6, this may conflict with them. `ScrapeCompetitors` defaults
  to off for exactly that reason.

### Blocked on §2.9, not on this

The endpoint is keyed by SKU, and today nothing supplies one: `HepsiburadaAdapter.fetchListings`
is still blocked (doc 12 Phase 4.4). When it is implemented it must record the product SKU as
`ListingSnapshot.productPage.contentId`; the source deliberately refuses to derive a SKU from a
product-page slug, since that would mean parsing display text. **Until then Hepsiburada
competitor history is still not collected** — the source is registered and simply never asked
for anything. Repricing on Hepsiburada is unaffected either way: it runs on the official buybox
rank (§2.5), exactly as designed.

---

# 3. Verification log

| Date | Marketplace | What was verified | By |
|------|-------------|-------------------|-----|
| 2026-08-12 | Trendyol | Base URLs, auth, rate limits, product filter V2 (incl. `commission`, `vatRate`, `priceSeenByCustomer`), inventory-and-price filter, buybox check (incl. `secondBuyboxPrice`/`thirdBuyboxPrice`), price-and-inventory update, batch request result | fetched from official docs |
| 2026-08-12 | Hepsiburada | Hosts per domain, Basic auth + User-Agent, rate limits and the 10× daily update allowance, inventory upload flow, business error codes, commission/VAT sources, orders paging | product owner's portal research; endpoint schemas still 🔴 |
| 2026-08-13 | Hepsiburada | §2.11 public listings endpoint `/api/v1/product/listings/{sku}`: 200 + 10 sellers for `BS1372`, the minimum accepted header set (measured by ablation), no credential required, ~8-request rate ceiling, `data.listings[]` field map, price unit fixed as lira by `formattedPrice` | direct request by the assistant, product owner supplied the endpoint and authorised browser headers; response recorded as a fixture |
| 2026-08-13 | Trendyol | §1.6 public product-page payload: `__envoy__SHARED_PROPS` marker, `product.merchantListing` as an object, winner joined from `merchant` + `winnerVariant`, `otherMerchants[].variants[]`, `{value,text}` price nodes in lira, `"NaN TL"` rrp | product owner's extraction guide (`docs/trendyol-merchants-scraping-guide.md`), implemented and fixture-tested in `packages/adapters/src/trendyol/public-page/` |
