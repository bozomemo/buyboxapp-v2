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
Trendyol's own canonical link, but its query string carries `merchantId=<our own seller id>`
and that param is always stripped before requesting the public page: fetching it with our own
`merchantId` present is not neutral, it returns our own offer as the winner on every row
regardless of the real buybox order (found 2026-08-17, `docs/trendyol-merchants-scraping-guide.md`
§37.2 log entry, implemented in `source.ts`'s `buildUrl`). Everything but `merchantId` (e.g.
`filterOverPriceListings`) is left as Trendyol supplied it. **This is a plain HTML GET; there
is no JSON API** — the whole application state is embedded in the response — but see "Operating
constraints" below for why the *transport* fetching it is a real browser, not a plain HTTP
client.

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

### ✅ Resolved 2026-08-26 — `discountedPrice` is already the discounted price

The question below is **closed, in favour of reading 1**. Settled by fetching two live product
pages through the production Playwright transport and dumping every key of the price node —
which the archive could never have settled, because it only ever stored the two fields already
in question.

`couponApplicablePrice` **is present on every offer and is read correctly.** It is not a
mapping defect. It equals `discountedPrice` because on this marketplace `discountedPrice` has
*already had the promotion applied*.

The proof is a fourth field nobody had looked at, on our own offer (merchant `722974`, product
`859939211`, 2026-08-26):

```jsonc
{ "discountedPrice":                        { "value": 420 },   // what we store as `price`
  "couponApplicablePrice":                  { "value": 420 },   // → `finalPrice`, hence identical
  "discountedPriceAfterNoLimitPromotions":  { "value": 450 },   // the shelf price
  "promotions": ["350 TL ve Üzeri Kargo Bedava", "300 TL'ye 30 TL İndirim"] }
```

450 − 30 = 420. The promotion text names the discount, and `discountedPrice` already carries it.

Three consequences, all of which stand until Trendyol's payload changes:

1. **`final_price` being equal to `price` on all 6,039 archived observations is correct**, not a
   silent failure — including on the 166 that carry an explicit `Sepette %N İndirim`. The
   `finalPrice ?? price` rule §2.11 imposes for Hepsiburada is harmless here rather than
   load-bearing.
2. **We store no shelf price.** `discountedPriceAfterNoLimitPromotions` is not mapped, so
   "what was it before the campaign?" is unanswerable from our archive. Reading 1 predicted
   exactly this. Worth adding if a report ever needs discount *depth*; not needed for a pricing
   decision, which cares only about the price a customer actually pays.
3. **`tyPlusCouponApplicablePrice` is a real, sometimes-different price that we do not read.**
   Product `1149754452`, merchant `1267732`: `discountedPrice` 720, `tyPlusCouponApplicablePrice`
   684, promotion `Trendyol Plus'a Özel Fiyat`. It is a membership-gated price, so it is not the
   price every customer sees and must **not** silently replace `price`. Recorded here as a known,
   deliberate omission rather than an oversight — mapping it would need its own field and its own
   decision about which audience a competitor report is written for.

The original question and its evidence follow, unedited.

### Open question — `couponApplicablePrice` has never once been observed *(raised 2026-08-18, closed 2026-08-26 — see above)*

The normaliser maps `finalPrice` to `couponApplicablePrice`, falling back to `discountedPrice`
when no coupon price exists (guide §14, §26). Across the entire live archive — **1,799
observations, 64 listings — `final_price` differs from `price` exactly zero times, and is never
null.** The fallback has fired every time; the coupon field has never appeared.

That is not obviously correct, because the discount is real on the site. Checked by the operator
on 2026-08-18: product `844564577` showed a shelf price of 3.000,00 ₺ and a basket price of
2.990,00 ₺, matching its `Sepette 10 TL İndirim` promotion. A shelf→basket delta exists; our data
has never carried one.

Two readings, and they mean different things downstream:

1. `discountedPrice` **is already** the basket price, in which case `price` has been the customer
   price all along, `finalPrice` is genuinely redundant on this marketplace, and we store no
   shelf price at all.
2. `couponApplicablePrice` is a real sibling we are failing to read — a mapping defect.

**To resolve:** fetch one such product fresh and compare `sellingPrice` / `discountedPrice` /
`couponApplicablePrice` side by side against what the page and the basket show at that moment.
The archive cannot settle it, because the observation and the operator's check are a day apart
and the seller may simply have repriced. Until it is settled, consumers read
`finalPrice ?? price` and record which one they used.

Separately confirmed on the same check and **working as intended**: quantity-tiered promotions
(`2. Ürüne %10 İndirim`, `3 Adet ve Üzeri 150 TL İndirim`) do **not** move any price field, and
must not. Product `1145880513` listed at 2.790,00 ₺ for a single unit with the discount visible
only after adding two. Promotion *text* advertises reductions that no price field carries — one
more reason a competitor price is never derived from it.

### Operating constraints — all mandatory

| Constraint | Where it lives |
|---|---|
| Rate limiting, independent of the Seller API limiters | `TrendyolPublicPageSource` (30 req/min, burst 5 — doc 08) |
| Caching of identical requests | same, 10-minute TTL keyed by resolved URL |
| Tiered polling by listing importance | `ScrapeCompetitors` (doc 07 §4, §7) |
| Browser-identifying `User-Agent` | `SCRAPER_BROWSER_USER_AGENT` (doc 08) — an honest agent got a 403 from Trendyol's bot detection even at a conservative request rate; confirmed 2026-08-17 when the operator's own browser reached the same product page without incident from the same network. The product owner authorised the same reporting-only exception already recorded for Hepsiburada (§2.11, 2026-08-13). |
| Bounded retry on 403 specifically | `TrendyolPublicPageSource.retryOn403MaxAttempts` (doc 08) — kept as a cheap second line of defence even after the transport fix below; never applied to any other status. |
| **No Node-native HTTP client is used for this scraper — a real headless browser is** | `playwright-fetch.ts` (`packages/adapters/src/trendyol/public-page/`), Playwright + headless Chromium. First tried Node's core `https` in place of `fetch` (`node-https-fetch.ts`, kept as an injectable alternative, no longer the default) on the theory that undici's connection handling was the problem; re-measured live and that did **not** hold — Node's core `https` also returned 403 consistently, even with a full realistic browser header set. The actual mechanism: Cloudflare fingerprints the **TLS ClientHello**, and `fetch` and Node's core `https` share the same OpenSSL TLS stack, so neither was ever going to pass reliably — `curl` had only succeeded because it happened to run through Windows' Schannel TLS on the diagnostic machine. A real browser's TLS/JS fingerprint is what actually clears the check: confirmed 2026-08-17, 10/10 consecutive previously-failing product pages returned 200 through a headless Chromium instance. This is the "browser impersonation" exception above (the `SCRAPER_BROWSER_USER_AGENT` row) taken literally rather than approximated via headers on a non-browser client. |
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

✅ **Listing integration verified 2026-08-14 against the vendor's own OpenAPI document.**

The developer portal is a single-page app whose content comes from a public JSON API on the
same host. It answers a browser-shaped request (the same Akamai fingerprint check as §2.11 —
an honest user agent gets 403), and the accepted request is recorded in §2.12. Two artefacts
were retrieved and are **stored verbatim in the repository**:

| File | What it is |
|------|-----------|
| `docs/vendor/hepsiburada-listing-openapi-v1.json` | `HEPSIBURADA - LISTELEME ENTEGRASYONU` v1, OpenAPI 3.0.1, 18 operations / 25 schemas, published 2026-04-30 |
| `docs/vendor/hepsiburada-listing-guide.json` | The portal guide *Listeleme Entegrasyonu Önemli Bilgiler* — limits, error catalogue, field meanings |

**These files are the source of truth for §2.4–§2.7.** They are recorded, not transcribed: if
this prose and the OpenAPI document disagree, the OpenAPI document wins and this prose is the
bug. Re-fetch them (§2.12) rather than editing them by hand.

⚠️ Still compiled from the product owner's portal research plus the legacy implementation, and
therefore **not** verified: catalogue (mpop) and orders (oms). Those keep their 🔴 marks — the
OpenAPI document retrieved covers the *listing* integration only.

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

Confirmed 2026-08-14 from the OpenAPI document and the guide:

- The only security scheme declared is `basic` (`type: http`, `scheme: basic`). There is no
  bearer token, no API-key header, and no OAuth flow on the listing integration.
- **`User-Agent` is a declared, `required: true` header parameter on every one of the 18
  listing operations.** It is part of the contract, not a convention — a request without it is
  malformed. The vendor documents no required *format*, so the adapter sends its own
  identifying agent (`SCRAPER_USER_AGENT` is a different setting and must not be reused here).
- The SIT host becomes production by removing `-sit`, and **production has its own
  user/password** — SIT credentials do not work against production.
- The guide states the authentication structure of all services was changed and integrators
  must migrate; a service key is added/viewed per integrator from the merchant panel.

🔴 Remaining: whether the Basic username is the merchant's own login or an integrator-scoped
service key, and who owns it. This is an account question for the merchant, not a schema
question — it cannot be answered from the documentation.

## 2.3 Rate limits and quotas ✅ — **these constrain the repricing design**

| Domain | Limit |
|--------|-------|
| Catalogue API | 180 requests / minute / IP |
| Orders API | 1,000 requests / second (SIT and production) |
| Listing inventory update — batch size | **≤ 4,000 listings per request** |
| Listing inventory update — concurrency | **≤ 5 simultaneous pending/processing uploads** |
| Listing inventory update — daily allowance | **10 × the merchant's listing count, per day** |
| Commission lookup — batch size | ≤ 50 SKUs per request ✅ *(2026-08-14)* |
| Commission lookup — rate | ~240 requests / minute / merchant ✅ *(2026-08-14)* |
| Buybox rank — batch size | ≤ 10 SKUs per request ✅ *(2026-08-14)* |

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

## 2.4 Listing service — list / filter listings ✅ *(verified 2026-08-14)*

Portal path: **Listing ve Satışa Açma → Listeleme → Listing Bilgilerini Sorgulama**

This is the authoritative source for the merchant's **commercial listing state** (price,
stock, sale state, merchant SKU), as distinct from the Catalogue API which carries product
master data.

```
GET {listing-host}/listings/merchantid/{merchantId}
Auth: Basic · Required header: User-Agent
```

Query parameters — the complete declared set:

| Name | Type | Required | Notes |
|------|------|----------|-------|
| `offset` | int32 | **yes** | default `0`. Paging is mandatory when listing everything. |
| `limit` | int32 | **yes** | default `10` |
| `hbSkuList` | string | no | comma-separated |
| `merchantSkuList` | string | no | comma-separated |
| `salable-listings` | boolean | no | note the hyphens — not camelCase |
| `notsalable-listings` | boolean | no | |
| `updateStartDate` | date-time | no | enables watermark-based incremental sync |
| `updateEndDate` | date-time | no | |
| `productId` | string | no | |

Response `ExternalListingsRepresentation`:

```
{ listings: Listing[] | null, totalCount: int32, limit: int32, offset: int32 }
```

`Listing` — every declared property, `additionalProperties: false`:

| Field | Type | Notes |
|-------|------|-------|
| `listingId` | uuid | |
| `uniqueIdentifier` | string? | |
| `hepsiburadaSku` | string? | Hepsiburada's listing id |
| `merchantSku` | string? | our id |
| `price` | double | **lira, not kuruş.** Convert at the adapter boundary. |
| `availableStock` | int32 | |
| `dispatchTime` | int32 | days |
| `cargoCompany1..3` | string? | see the accepted carrier names in the guide |
| `shippingAddressLabel`, `claimAddressLabel` | string? | |
| `shippingProfileName` | string? | |
| `maximumPurchasableQuantity`, `minimumPurchasableQuantity` | int32 | `0` on max means unlimited |
| `pricings[]` | `ListingPricingRepresentation`? | `finalPrice` (double), `startDate`, `endDate`, `debtors[]` |
| `isSalable` | bool | |
| `customizableProperties[]` | | |
| `deactivationReasons[]` | string[]? | |
| `isSuspended`, `isLocked`, `isFrozen` | bool | |
| `lockReasons[]`, `freezeReasons[]` | string[]? | |
| `availableWarehouses[]` | string[]? | |
| `isFulfilledByHB` | bool | |
| `priceIncreaseDisabled` | bool | **read this before submitting an increase** |
| `priceDecreaseDisabled` | bool | **read this before submitting a decrease** |
| `stockDecreaseDisabled` | bool | |
| `skuAfterSuspension` | string? | |
| `productId` | string? | |
| `hasVariant` | bool | |

> ⚠️ **`commissionRate` is not on this schema.** The legacy field list claimed it was. Commission
> comes from the dedicated service in §2.7 — do not expect it here.

> ⚠️ **No `productPage` / SKU-to-URL field exists either.** The competitor source in §2.11 keys
> on `hepsiburadaSku`; that is the field `fetchListings` must carry into
> `ProductPageRef.contentId`.

Two engine-facing consequences, both new:

- `priceIncreaseDisabled` / `priceDecreaseDisabled` are per-listing marketplace kill switches.
  Submitting against them wastes daily budget (§2.3) and will be rejected. The decision engine
  must treat them as a hard constraint, alongside our own floor.
- `isLocked` with `lockReasons[]` is how a rejected price manifests *after* the fact — see the
  `MinLock`/`MaxLock` flow in §2.6.

The response is also offered as `application/xml`. Request JSON explicitly with
`Accept: application/json`; the guide is explicit that the content type is negotiated.

## 2.5 Buybox rank 🟡 — **endpoint confirmed 2026-08-14, response schema not declared**

Portal path: **Buybox Sıralama Sorgulama** (tag `Buybox`)

The endpoint the legacy app used **still exists, under that exact name**:

```
GET {listing-host}/buybox-orders/merchantid/{merchantId}?skuList=a,b,c
Auth: Basic · Required header: User-Agent
```

Confirmed from the OpenAPI document and the guide:

- `merchantId` is a path `uuid`; `skuList` is a single comma-separated string query parameter.
- **Maximum 10 SKUs per request** (guide) — the legacy limit was right.
- Only SKUs whose listing has `isSalable = true` (§2.4) may be queried.

Fields the guide documents on the response: `SKU`, `Rank`, `Price`, `DispatchTime`,
`MerchantRating`.

🔴 **The OpenAPI document declares the 200 response as bare `Success` with no schema.** The
field *names* above come from the guide's prose table, so their casing, nesting and JSON types
are unknown, and the guide does not say whether a competitor's *identity* (`merchantName`) is
returned — the legacy app believed it was, the current guide does not list it.

Do not write a normaliser against the five names above. Capture one real SIT response first
and record it as a fixture, exactly as §2.11 was done.

> Note the asymmetry this creates. This endpoint is a **control-path** source (authenticated,
> merchant-scoped, our own listings) and may feed pricing. The §2.11 public endpoint is a
> **reporting** source and may not. They must not be merged behind one port just because both
> mention competitors.

## 2.6 Inventory & price update ✅ *(verified 2026-08-14)*

Portal path: **Listing Envanter Güncelleme** → **Listing Envanter Güncelleme Sorgulama**

### Use `price-uploads`, not `inventory-uploads` ✅ — **decision**

The OpenAPI document declares four parallel upload families, each with its own POST and its
own status GET:

| Endpoint | Body item | Use for |
|----------|-----------|---------|
| `.../price-uploads` | `PriceUploadRequestModel` | **repricing — this is ours** |
| `.../stock-uploads` | `StockUploadRequestModel` | stock only |
| `.../inventory-uploads` | `InventoryUploadRequestModel` | full listing state |
| `.../shipping-info-uploads`, `.../additional-info-uploads` | | not used |

`InventoryUploadRequestModel` carries 18 fields — carriers, warehouses, addresses, shipping
profile — and the guide states that **every field except `ProductName`, `ShippingProfileName`
and `MaximumPurchasableQuantity` is mandatory**. Submitting a price through it therefore means
re-sending the listing's entire configuration on every price change, and any field we get
wrong silently overwrites live data.

`PriceUploadRequestModel` is three fields:

```
{ hepsiburadaSku: string?, merchantSku: string?, price: double? }
```

**The adapter must use `price-uploads`.** This is the narrowest endpoint that does the job, it
cannot clobber a field we did not intend to change, and it has a dedicated status endpoint
returning price-specific validation results. The legacy app used the inventory endpoint; that
is one more reason not to copy it.

The guide confirms `hepsiburadaSku` and `merchantSku` may each appear alone or together.

> ⚠️ Price is `number/double` **in lira**, and the guide's `InvalidPrice` error states a price
> written with a **dot** is rejected. Our money is `bigint` kuruş; the conversion to the wire
> value happens in the adapter, at the boundary, and nowhere else.

### The flow

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

Submission ✅ — **JSON is accepted**; the legacy XML body is one of seven offered content
types (`application/json`, `application/json-patch+json`, `text/json`, `application/*+json`,
`application/xml`, `text/xml`, `application/*+xml`), not a requirement. Send JSON.

```
POST {listing-host}/listings/merchantid/{merchantId}/price-uploads
Auth: Basic · Required header: User-Agent · Accept: application/json
Body: PriceUploadRequestModel[]          ← a bare array, not an envelope
→ 200 { "id": "<uuid>" }                 ← PriceUploadRepresentation: one field
```

An accepted response carries **only** the id. There is no per-item acknowledgement at
submission time, which is exactly why the audit record may not be written here (CLAUDE.md:
"write a price-change audit record only after the marketplace confirms the submission").

If the request is malformed no id is returned; the guide notes the response header
`x-correlation-id` identifies the attempt for up to 7 days via a merchant support ticket.
**Log `x-correlation-id` on every submission** — it is the only handle on a failure that
produced no id.

Status check ✅ — `PriceUploadResultRepresentation`:

```
GET {listing-host}/listings/merchantid/{merchantId}/price-uploads/id/{id}
Auth: Basic · Required header: User-Agent

{ id: uuid,
  status: string?,                 // "Done" | "Failed" (guide); treat as an open set
  createdAt: date-time,
  total: int32,                    // items in the submitted batch
  errors: Error[]?,                // hard rejections
  priceValidations: PriceValidation[]? }   // ← price-uploads only

Error            { elementNo: int32, hepsiburadaSku: string?, merchantSku: string?, errors: string[]? }
PriceValidation  { elementNo: int32, hepsiburadaSku: string?, merchantSku: string?,
                   type: string?,                  // "MinLock" | "MaxLock" observed
                   minPrice: double, maxPrice: double,
                   regulativePriceDetail: { minAmount: double?, maxAmount: double?, categoryName: string? },
                   description: string? }
```

`elementNo` is **1-based** and indexes the submitted array, which is how a per-item result is
matched back to the price change that produced it.

🟡 The guide documents only `Done` and `Failed` for `status`, and the OpenAPI declares it as a
free string with no enum. Treat any unrecognised value as "not yet confirmed" and keep polling
— never as success. The connector's own state machine still distinguishes `submitted`,
`pending`, `processing`, `completed`, `partiallyFailed`, `failed`.

### Price locks — `MinLock` / `MaxLock` ⚠️ *(new; this changes the engine)*

Hepsiburada now applies **category-based price thresholds**. A price outside the threshold
does not merely fail: **the SKU is locked**, and stays locked until the merchant unlocks it.
The batch reports `status: "Done"` with a `priceValidations[]` entry — a successful-looking
response that has taken the listing off sale.

```json
{ "id": "715bae7f-…", "status": "Done", "total": 1, "errors": null,
  "priceValidations": [
    { "elementNo": 1, "hepsiburadaSku": "HBCV00002LJ9YU", "merchantSku": "…",
      "type": "MaxLock", "minPrice": 899.8, "maxPrice": 13767.0,
      "description": "Yüksek fiyat sebebiyle kilitlendi. …" } ] }
```

Required handling — none of this is optional:

1. **A non-empty `priceValidations[]` is a failure, regardless of `status`.** Never write a
   successful price-change audit record for an element that appears there.
2. Persist `minPrice` / `maxPrice` as a marketplace-imposed price band for that listing and
   intersect it with our own floor/ceiling on the next decision. Resubmitting the same price
   locks the listing again and burns daily budget (§2.3).
3. Surface the lock to the operator. `POST .../bulk-unlock` (`BulkUnlockRequestModel`) exists
   and unlocks *at the price we submitted* — so it must never be automatic. Unlocking is a
   deliberate human decision to sell at that price.
4. `isLocked` / `lockReasons[]` on §2.4 is the same condition observed later.

This is a stronger constraint than the `OutOfPriceRange` rejection below, and it did not exist
when the legacy app was written.

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

The guide states the rule concretely ✅ *(2026-08-14)*: the mean of the listed prices is taken
**excluding the lowest and the highest**, and the maximum submittable price is that mean times

| Mean price band | Maximum |
|---|---|
| 0 – 50 TL | 250 % |
| 50 – 100 TL | 150 % |
| 100 – 200 TL | 120 % |
| 200 – 500 TL | 100 % |
| 500 – 2 000 TL | 90 % |
| over 2 000 TL | 80 % |

⚠️ Recorded for diagnosis, **not to be reimplemented**. The bands are the marketplace's, they
change without notice, and the trimmed mean is over prices we cannot see. Predicting the
rejection locally would produce a second, silently-wrong ceiling. The engine's ceiling stays
ours; `OutOfPriceRange` and `MaxLock` are observed, not forecast.

Other item-level errors documented by the guide, all as `Error.errors[]` strings:
`ProductNotFound`, `MismatchingSkusSpecified`, `DuplicateHepsiburadaSkuSpecified`,
`DuplicateMerchantSkuSpecified`, `MissingHeaders`, `InvalidPrice`, `InvalidAvailableStock`,
`InvalidDispatchTime`, `InvalidMaximumPurchasableQuantity`, `DiscountedListingPriceIncrease`,
`MerchantAlreadyListedAgainstProduct`, `ListingDeletedRecently`, `ListingFrozen`,
`MissingStandardCargoCompany`, `restrictedProductBrand`.

`ListingFrozen` and `ListingDeletedRecently` are permanent for that listing until a human acts.
`DiscountedListingPriceIncrease` means the listing is in a campaign — the engine must not
retry an increase against it.

## 2.7 Commission and VAT ✅

Two distinct sources:

| Source | Gives |
|--------|-------|
| **Listing integration** — `commissionRate`, plus the dedicated **Komisyon Bilgisi Sorgulama** service (introduced October 2025) | Commission *before* a sale — what the pricing model needs |
| **Orders integration** — `commission.amount`, `commission.currency`, `commissionRate`, `vat`, `vatRate` | Actual commission and VAT charged *on a real sale* — the ground truth for validating the cost model |

Komisyon Bilgisi Sorgulama 🟡 *(endpoint verified 2026-08-14, response schema not declared)*:

```
GET {listing-host}/commissions/merchantid/{merchantId}?skuList=a,b,c
Auth: Basic · Required header: User-Agent
```

- **Maximum 50 SKUs per request** (guide).
- **~240 requests per minute per merchant**; exceeding it returns `429 Too Many Request`.
  This is the only per-minute figure the vendor states for the listing host — add it to §2.3.

🔴 As with §2.5, the OpenAPI declares the 200 response as bare `Success` with no schema.
Record a real SIT response before writing a normaliser.

🔴 **Product VAT rate is confirmed absent from the listing schema** (§2.4 lists every declared
property and there is no VAT field). So it is either on this commission response or only on
orders. The pricing model needs it pre-sale
(see `docs/02-cost-and-price-model.md`) — this is now the single most important unknown left
on Hepsiburada, because a wrong VAT rate produces a wrong floor price.

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

## 2.9 Outstanding confirmations — *revised 2026-08-14*

### Resolved ✅ — Phase 4.4 is no longer blocked

| Was | Now |
|-----|-----|
| Authentication scheme | Basic only, no bearer/API-key — §2.2 |
| Exact required `User-Agent` convention | Declared `required: true` on all 18 operations; no format imposed — §2.2 |
| Listing Information — full query parameters | All 9 declared — §2.4 |
| **Listing Information — full response JSON schema** | `ExternalListingsRepresentation` / `Listing`, every property — §2.4 |
| Inventory/price update — JSON or XML? | **JSON**; XML is one of seven offered types — §2.6 |
| Inventory batch accepted-response schema | `{ id: uuid }` and nothing else — §2.6 |
| **Upload status — canonical enum values** | `Done` / `Failed` documented; declared as a free string, so treated as an open set — §2.6 |
| **Batch item-level failure schema** | `Error` + `PriceValidation`, with 1-based `elementNo` — §2.6 |
| Buybox — endpoint and limits | `/buybox-orders/…`, ≤ 10 SKUs, salable listings only — §2.5 |
| Commission — endpoint and limits | `/commissions/…`, ≤ 50 SKUs, ~240 req/min — §2.7 |
| Production URLs | SIT host minus `-sit`, with separate production credentials — §2.1, §2.2 |

Two things that were not on this list and should have been, both now in §2.6:
**`MinLock`/`MaxLock` price locking**, and the fact that
**`priceIncreaseDisabled`/`priceDecreaseDisabled` are per-listing marketplace kill switches**.

### Still open 🔴

Ordered by what they block.

- [ ] **Product VAT rate pre-sale** — confirmed *not* on the listing schema (§2.4). Blocks a
      correct floor price. Either the commission response carries it or it exists only on
      orders. **The most important one.**
- [ ] **Buybox response schema** (§2.5) — field names known from prose, JSON shape unknown.
      Record a SIT response. Blocks the buybox client, not repricing.
- [ ] **Commission response schema** (§2.7) — same situation, and it may answer the VAT
      question at the same time.
- [ ] Who owns the Basic username / service key (§2.2) — an account question for the merchant,
      not answerable from documentation.
- [ ] Orders — full response schema, and the merchant's automatic-packaging mode. Only affects
      §2.8, which is MAY-ADD-LATER.
- [ ] Catalogue (mpop) integration — untouched by this verification.

**The three schema items above are all answerable from one SIT session.** Once credentials
exist, call listings / buybox / commissions once each, record the responses as fixtures in
`packages/adapters/src/hepsiburada/fixtures/`, and close them together.

### What is *not* required to start 4.4

Listing retrieval and price submission — the entire repricing control path — are fully
specified. Building them does not depend on any open item, provided the adapter records the
buybox and commission responses rather than parsing them.

✅ **Built 2026-08-14** (`packages/adapters/src/hepsiburada/`): `fetchListings`,
`submitPriceChanges`, `pollSubmission`, tested against fixtures shaped from the OpenAPI schema.
`fetchBuyboxObservations` still throws — see §2.5.

## 2.10 Adapter structure

Rate-limit and configure each client independently:

```
HepsiburadaAdapter
├── auth
├── CatalogueClient   product master data            (180 req/min/IP)
├── ListingClient     list · price upload · poll · commission lookup
├── BuyboxClient      buybox rank                    (≤ 10 SKUs/request)
└── OrdersClient      paid/open · packages · cancelled · shipped · delivered · undelivered
```

### All 18 listing operations ✅ *(2026-08-14)*

Recorded so the adapter is written against the real surface, not a subset. Every one is Basic
auth with a required `User-Agent`; `{m}` is the merchant `uuid`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/listings/merchantid/{m}` | list / filter listings (§2.4) |
| POST | `/listings/merchantid/{m}/price-uploads` | **price update (ours, §2.6)** |
| GET | `/listings/merchantid/{m}/price-uploads/id/{id}` | **price batch status (§2.6)** |
| POST | `/listings/merchantid/{m}/stock-uploads` | stock update |
| GET | `/listings/merchantid/{m}/stock-uploads/id/{id}` | stock batch status |
| POST | `/listings/merchantid/{m}/inventory-uploads` | full listing update — **avoid, §2.6** |
| GET | `/listings/merchantid/{m}/inventory-uploads/id/{id}` | inventory batch status |
| POST | `/listings/merchantid/{m}/shipping-info-uploads` | dispatch/carrier update |
| GET | `/listings/merchantid/{m}/shipping-info-uploads/id/{id}` | status |
| POST | `/listings/merchantid/{m}/additional-info-uploads` | extra attributes |
| GET | `/listings/merchantid/{m}/additional-info-uploads/id/{id}` | status |
| POST | `/listings/merchantid/{m}/sku/{sku}/activate` | put on sale |
| POST | `/listings/merchantid/{m}/sku/{sku}/deactivate` | take off sale |
| POST | `/listings/merchantid/{m}/sku/{sku}/merchantsku/{msku}` | single price/stock update |
| DELETE | `/listings/merchantid/{m}/sku/{sku}/merchantsku/{msku}` | delete listing |
| POST | `/listings/merchantid/{m}/bulk-unlock` | clear `MinLock`/`MaxLock` — **never automatic (§2.6)** |
| GET | `/buybox-orders/merchantid/{m}` | buybox rank (§2.5) |
| GET | `/commissions/merchantid/{m}` | commission (§2.7) |

⚠️ `activate` / `deactivate` / `DELETE` are **destructive and out of scope for repricing.** The
adapter may not expose them; a repricing system has no business deleting a listing. Recorded
here only so nobody rediscovers them and assumes they were forgotten.

## 2.12 Re-fetching the vendor documentation

The portal SPA reads a public JSON API on its own host. The request must be browser-shaped or
Akamai returns 403 — the same condition as §2.11, and the same
authorised-exception reasoning applies (CLAUDE.md). Verified 2026-08-14:

```
Base   https://developers.hepsiburada.com/api/v1
Headers  User-Agent: <SCRAPER_BROWSER_USER_AGENT>
         Accept: application/json, text/plain, */*
         Accept-Language: tr-TR,tr;q=0.9
         Sec-Fetch-Dest: empty · Sec-Fetch-Mode: cors · Sec-Fetch-Site: same-origin
         Referer: https://developers.hepsiburada.com/en/companies/hepsiburada
```

| Path | Returns |
|---|---|
| `/public/companies/hepsiburada/categories` | the 11 documentation categories |
| `/public/companies/hepsiburada/categories/{slug}/products` | products in a category |
| `/public/companies/hepsiburada/products/{p}/versions` | versions, with `operationCount` |
| **`/public/docs/hepsiburada/{p}/{v}/openapi`** | **the full OpenAPI document** |
| `/public/docs/hepsiburada/{p}/guides` · `/guides/{slug}` | prose guides |

The listing integration is `{p} = listeleme`, `{v} = v1`. Other categories worth retrieving
when their phase arrives: `siparis-yonetimi` (orders, §2.8),
`katalog-urun-entegrasyonu` (catalogue), `muhasebe-entegrasyonu` (accounting — relevant to the
Phase 8.3b settlement gate).

⚠️ **Rate**: roughly 4–5 requests in quick succession trips a temporary block, after which a
previously-accepted request returns 403 — measured, same behaviour as §2.11. Space requests
~10 seconds apart. This is a manual, occasional operation; **do not automate it.**

Static assets (`/assets/*.js`) need `Sec-Fetch-Dest: script`; the API paths were found in the
SPA bundle rather than being guessed.

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

  **Consequence, recorded 2026-08-18:** `finalPrice` is therefore hard-coded `null` for every
  Hepsiburada offer (`public-listings/normalize.ts`), not merely null when data is missing. Any
  consumer that reads `finalPrice` alone gets nothing on this marketplace — an alert rule keyed
  on it would never fire, silently, across the whole marketplace rather than on one listing.
  Consumers must read `finalPrice ?? price` and record which of the two they used.

  Re-checking this is **blocked on live data**: the Hepsiburada connection is a test-environment
  one and the product owner does not trust its prices (decision 2026-08-18). To be verified when
  a live store is connected.
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
| 2026-08-14 | Hepsiburada | **§2.2, §2.4, §2.6, §2.10 — the whole listing integration.** Basic-only auth with a mandatory `User-Agent`; all 9 listing query parameters and the complete `Listing` schema; JSON accepted on uploads; `price-uploads` chosen over `inventory-uploads`; `{id}`-only accepted response; `Error` + `PriceValidation` item-level schema with 1-based `elementNo`; **`MinLock`/`MaxLock` price locking**; `priceIncrease/DecreaseDisabled` kill switches; the full 18-operation surface; commission ≤50 SKU / ~240 req-min and buybox ≤10 SKU limits; the `OutOfPriceRange` bands | assistant, from the vendor's own OpenAPI 3.0.1 document and portal guide, retrieved via the portal's public content API (§2.12) after the product owner suggested applying the §2.11 browser-header technique; both artefacts stored verbatim in `docs/vendor/` |
| 2026-08-18 | Trendyol | §1.6 — **open question raised, not closed.** `couponApplicablePrice` never observed across 1,799 archived observations (`final_price` never once differs from `price`), yet the site shows a real shelf→basket delta (product `844564577`: 3.000,00 ₺ shelf → 2.990,00 ₺ basket). Separately **confirmed correct**: quantity-tiered promotions move no price field (product `1145880513`, 2.790,00 ₺ for a single unit) | operator checked both products live in a browser; archive figures measured by the assistant against `apps/web/data/app.db`. **Needs a fresh payload comparison to settle** |
| 2026-08-18 | Hepsiburada | §2.11 — recorded that `finalPrice` is hard-coded `null` for every offer, so it is null by design rather than by absence, and consumers must read `finalPrice ?? price`. Re-check deferred: the connected store is a test environment whose prices the product owner does not trust | product owner decision; code inspection of `public-listings/normalize.ts` |
| 2026-08-26 | Trendyol | §1.6 — **2026-08-18's open question closed.** Two live product pages (`1149754452`, `859939211`) fetched through the production Playwright transport with every price-node key dumped. `couponApplicablePrice` is present and correctly read; it equals `discountedPrice` because `discountedPrice` already has the promotion applied, proved by `discountedPriceAfterNoLimitPromotions` (450) sitting beside `discountedPrice` (420) under a `300 TL'ye 30 TL İndirim` promotion on our own offer. Also found: `tyPlusCouponApplicablePrice`, a membership-gated price that genuinely differs (720 → 684 on merchant `1267732`) and is deliberately not mapped | assistant, read-only live fetch; no credential sent, nothing written |
