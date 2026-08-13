# 2.3 Pages Needed to Complete This Section

This section consolidates the Hepsiburada Developer Portal information required to implement the marketplace integration.

The implementation should use the current Hepsiburada Merchant API documentation as the source of truth. The Developer Portal currently covers separate integration domains for catalogue/product data, listings and inventory, orders, shipping, accounting, invoicing, claims, and related merchant operations.

---

## 2.3.1 Getting Started / Authentication

### Authentication scheme

Hepsiburada Merchant APIs use **HTTP Basic Authentication**.

Credentials must be supplied through the HTTP `Authorization` header:

```http
Authorization: Basic base64(username:password)
```

The Developer Portal explicitly states that Basic Authentication is required for the integration APIs and that authorization must be applied to the endpoints being used.

Test/development credentials are provided by Hepsiburada during the integration onboarding process. The test integration guide states that development credentials are provided separately and that Basic Authentication is used together with a `User-Agent` header.

### Required / common headers

The following headers should be treated as the standard request headers:

```http
Authorization: Basic <credentials>
User-Agent: <integration-client-identification>
Accept: application/json
Content-Type: application/json
```

For several important APIs, particularly Listing and Orders, `User-Agent` is explicitly marked as required.

`Content-Type` may differ for specific upload endpoints. For example, catalogue product submission uses a JSON file sent using multipart/form-data rather than a normal JSON body.

### Merchant ID

Most merchant-specific APIs require `merchantId`.

`merchantId` is the unique identifier assigned to a Hepsiburada merchant.

For production integrations, the merchant ID is provided/available through Hepsiburada Merchant integration configuration. The Merchant Portal can also expose the store ID after integrator authorization.

### Test and production environments

Portal endpoint examples normally point to **SIT/test environments**.

For the Orders integration, the documented SIT URL is based on:

```text
https://oms-external-sit.hepsiburada.com
```

The production URL is obtained by removing `-sit`:

```text
https://oms-external.hepsiburada.com
```

Hepsiburada explicitly documents this SIT → production convention for the Orders integration.

For Listing endpoints the test base currently appears as:

```text
https://listing-external-sit.hepsiburada.com
```

Example:

```text
GET /listings/merchantid/{merchantId}/inventory-uploads/id/{inventoryUploadId}
```



Catalogue/product APIs currently use a separate domain. For example:

```text
https://mpop-sit.hepsiburada.com
```

Example:

```text
GET /product/api/products/products-by-merchant-and-status
```



### Important implementation note

Do **not** define one global Hepsiburada API base URL in the connector.

Hepsiburada uses different API hosts for different integration domains, e.g.:

```text
Orders:
oms-external[-sit].hepsiburada.com

Listings:
listing-external[-sit].hepsiburada.com

Catalogue:
mpop[-sit].hepsiburada.com
```

The integration therefore should maintain base URLs by API/service group.

---

# 2.3.2 Rate Limits and Quotas

Rate limits are not globally identical across all Hepsiburada APIs.

## Catalogue API

The Catalogue/Product integration documentation currently specifies:

```text
180 requests / minute / IP
```



This should therefore be implemented as an IP-based throttle for Catalogue API operations.

## Orders API

Hepsiburada's Orders integration documentation states a service limit of:

```text
1,000 requests / second
```

for SIT and production environments.

Requests exceeding the limit receive:

```http
429 Too Many Requests
```

The response includes rate-limit metadata:

```http
X-RateLimit-Remaining
X-RateLimit-Limit
X-RateLimit-Reset
```

where:

| Header | Meaning |
|---|---|
| `X-RateLimit-Remaining` | Number of requests remaining in the current window |
| `X-RateLimit-Limit` | Maximum number of requests allowed in the window |
| `X-RateLimit-Reset` | Seconds remaining until the window resets |



The connector should respect these response headers instead of depending solely on a static client-side limit.

## Listing / inventory updates

Listing updates have additional business-level limits beyond HTTP request throttling.

Hepsiburada documents the following constraints:

```text
Maximum listings/SKUs per inventory update request: 4,000

Maximum simultaneous ongoing/waiting inventory upload operations: 5
```



In addition, Hepsiburada documents a **daily bulk listing update quota equal to 10 × the merchant's listing count**.

Example:

```text
Merchant listing count: 100
Daily listing update quota: 1,000 listing updates
```



A common error when this mechanism is exceeded is:

```text
There are too many ongoing/waiting inventory uploads at the moment.
Please try again later.
```

Hepsiburada recommends reducing parallel upload operations, placing more listings in each batch, and spacing updates so previous operations can complete.

### Connector requirement

The inventory writer should therefore implement:

```text
batch size <= 4,000 listings
concurrent pending batches <= 5
daily updated listing count <= 10 × merchant listing count
```

The batch status endpoint must be polled before aggressively submitting further batches.

---

# 2.3.3 Listing Service — List / Filter Listings

Hepsiburada refers merchants to the **Listing Bilgilerini Sorgulama / Listing Bilgilerini Çekme** service for retrieving the merchant's existing listings.

The current FAQ explicitly states that merchants can obtain the products in their inventory via this service.

## Purpose

The listing service should be used as the authoritative source for the merchant's **commercial listing state**, rather than the Catalogue API.

The conceptual distinction is:

```text
Catalogue/Product API
    -> product/master catalogue information

Listing API
    -> merchant-specific offer/listing information
       price
       inventory
       sale state
       merchant SKU
       commission-related information
       etc.
```

## Filtering

The connector should support at minimum:

```text
merchantId
merchantSku / SKU where supported
pagination
```

The exact current query parameter set of the Listing Information endpoint should be copied directly from the Developer Portal before implementation.

### Needs confirmation from live Developer Portal

The search-index version of the current Developer Portal confirms that the Listing Information service exists, but does not expose the endpoint's complete parameter and example-response definition.

Therefore the Product Owner should paste/export the current page:

**Listing ve Satışa Açma → Listeleme → Listing Bilgilerini Sorgulama / Listing Bilgilerini Çekme**

before the connector schema is frozen.

## Listing response model

The final response mapping should preserve all fields returned by Hepsiburada rather than selecting only SKU, stock and price.

At minimum, the integration model is expected to retain identifiers and commercial listing information such as:

```text
listingId
merchantId
merchantSku
hbSku
price
stock
shipping / dispatch information
listing status / sale status
commissionRate, where returned
```

The existence of commission information in the listing domain is confirmed by Hepsiburada's changelog: `commissionRate` was added/updated in the Listing integration, and a dedicated Commission Information Query service was subsequently introduced.

**The complete Listing response schema must nevertheless be copied from the current endpoint definition and must not be inferred from the fields above.**

---

# 2.3.4 Buybox Service / Buybox Orders

Hepsiburada provides functionality for obtaining the merchant's **Buybox position/rank**; the Developer Portal includes a “Buybox Sırasını Getirme” recipe.

However, based on the currently indexed Developer Portal pages, Hepsiburada does **not expose a separately documented service whose canonical name is “Buybox Orders Service.”**

For integration purposes, two concepts should therefore be kept separate:

```text
Buybox information
    -> commercial position/ranking of an offer

Orders API
    -> customer orders received by the merchant
```

If “Buybox orders service” in the product specification means **orders won by the merchant after winning Buybox**, these are still obtained through the normal Orders integration.

The standard open/paid order endpoint is:

```http
GET https://oms-external-sit.hepsiburada.com/orders/merchantid/{merchantId}
```

Production:

```text
https://oms-external.hepsiburada.com/orders/merchantid/{merchantId}
```

The service returns order lines in the received/open order state for the merchant.

## Order response information

The Orders integration documentation exposes fields including:

```text
items.id
items.orderId
items.orderNumber
items.orderDate
items.quantity
items.merchantId

items.totalPrice.currency
items.totalPrice.amount

items.unitPrice.currency
items.unitPrice.amount

items.vat
items.vatRate

items.customerName
items.status
items.shippingAddress

items.name
items.merchantSku
items.properties
```



Additional documented commercial fields include:

```text
commission.currency
commission.amount
commissionRate

unitHBDiscount.amount
totalHBDiscount.amount

merchantUnitPrice
merchantTotalPrice

cargoPaymentInfo

customizedText01
customizedText02
customizedText03
```



Depending on the specific order/package response, the API documentation also exposes delivery, cargo, billing and product-related information.

### Needs confirmation

If the project requirement explicitly refers to a different endpoint named **Buybox Orders**, the Product Owner should provide the exact Developer Portal endpoint link.

At present, the portal information supports treating:

```text
Buybox Rank API
```

and

```text
Orders API
```

as separate capabilities.

---

# 2.3.5 Inventory & Price Update Service

Hepsiburada Listing integration is the API domain responsible for sending:

```text
stock
price
dispatch / shipping lead-time
```

updates for merchant listings.

The operation is asynchronous/batch-oriented.

## Submission flow

Conceptually:

```text
1. Build inventory/price update batch.

2. POST batch to Listing Inventory Update API.

3. Hepsiburada returns an upload / request ID.

4. Store the returned inventoryUploadId.

5. Poll Listing Inventory Update Query API.

6. Inspect per-item success/failure results.

7. Retry or correct rejected records.
```

Hepsiburada explicitly documents that price/stock update requests return an ID that must be used to query the result of the update.

## Batch limits

Per request:

```text
Maximum 4,000 SKUs/listings
```

Parallel pending/processing operations:

```text
Maximum 5
```

Daily bulk update allowance:

```text
10 × current merchant listing count
```



## Confirmation flow

An accepted HTTP POST response must **not** be interpreted as proof that every listing update was applied.

The upload/request ID must be persisted and checked through:

**Listing Envanter Güncelleme Sorgulama**

Endpoint:

```http
GET /listings/merchantid/{merchantId}/inventory-uploads/id/{inventoryUploadId}
```

SIT host:

```text
https://listing-external-sit.hepsiburada.com
```

Authentication:

```text
Basic Auth
```

Required path parameters:

```text
merchantId
inventoryUploadId
```

Required header:

```text
User-Agent
```



## Price validation

Hepsiburada applies protection against abnormal pricing.

The Developer Portal FAQ documents range controls which can result in:

```text
OutOfPriceRange
```

when a proposed selling price exceeds Hepsiburada's permitted range derived from marketplace prices.

The threshold depends on the existing market-price range. This is a business rule enforced by Hepsiburada and cannot be disabled by the merchant.

The integration must therefore treat this as a **business validation failure**, not a transient transport error.

## Campaign-related rejection examples

Price or stock changes may also be rejected because of campaign restrictions, including errors such as:

```text
DiscountedListingPriceIncrease
DiscountedListingStockDecrease
```



These should normally be surfaced to the business/user rather than automatically retried indefinitely.

---

# 2.3.6 Upload / Batch Status Service

Inventory/price update processing is asynchronous.

The status lookup service is:

```http
GET https://listing-external-sit.hepsiburada.com/
    listings/merchantid/{merchantId}/
    inventory-uploads/id/{inventoryUploadId}
```



The purpose of this service is explicitly described as checking the successful/failed status of inventory update requests.

## Required connector behaviour

The connector should persist:

```text
merchantId
inventoryUploadId
submission timestamp
submission payload/reference
current batch state
last status-check timestamp
failure details
```

The resulting state machine should distinguish at least:

```text
submitted
pending / waiting
processing
completed
partially failed
failed
```

### Status names — Needs confirmation

The current publicly indexed endpoint does **not expose the complete runtime JSON response or the canonical enumeration of all batch status values**.

Therefore the exact enum values must be copied from:

**Listing Envanter Güncelleme Sorgulama**

using either:

- the endpoint's response schema in the Developer Portal, or
- an executed SIT request.

The connector should **not hard-code the illustrative status names above as Hepsiburada's canonical enum values** until this is confirmed.

## Failure structure

Failures should be stored per listing/SKU wherever the response provides item-level errors.

Relevant known business errors include:

```text
OutOfPriceRange

DiscountedListingPriceIncrease

DiscountedListingStockDecrease

There are too many ongoing/waiting inventory uploads at the moment.
Please try again later.

exceeds his inventory upload limit
```



The raw Hepsiburada error code/message should be retained for diagnosis.

---

# 2.3.7 Commission and VAT

Commission and VAT are exposed primarily through **order/transaction information**, while commission information is also available in the Listing integration.

## Orders

Hepsiburada's order response documentation exposes:

```text
vat
vatRate
```

for VAT.

It also exposes commission information including:

```text
commission.currency
commission.amount
commissionRate
```



This means an imported order line can retain:

```text
gross selling price
VAT amount
VAT rate
commission amount
commission rate
merchant-specific sale amount
Hepsiburada-funded discount
```

where present in the returned order payload.

## Listing API

Hepsiburada's changelog confirms that `commissionRate` information is associated with Listing integration.

In October 2025 Hepsiburada additionally introduced a dedicated:

**Komisyon Bilgisi Sorgulama**

service under Listing integration.

Therefore:

```text
Order integration
    -> actual commission/VAT associated with a sale

Listing / Commission Information API
    -> listing/product commission information usable before a sale
```

The dedicated Commission Information endpoint should be included if commission estimation is required before order creation/import.

---

# 2.3.8 Orders Service — Paging and Date Filtering

Include this section only when order import is within project scope.

The standard paid/open orders endpoint is:

```http
GET /orders/merchantid/{merchantId}
```

SIT:

```text
https://oms-external-sit.hepsiburada.com/orders/merchantid/{merchantId}
```



## Path parameters

```text
merchantId — required
```

## Query parameters

### `begindate`

Optional.

Returns order lines added on/after the provided starting date.

### `enddate`

Optional.

Returns order lines added before the provided end date.

### `offset`

Optional.

Number of records to skip.

Example:

```text
offset = 20
limit = 10
```

means:

```text
skip first 20 records
return the next 10
```

### `limit`

Controls the maximum number of order lines returned.

The endpoint documentation currently states a maximum/default result size of:

```text
100
```

and also notes that the `limit` parameter must be provided in the request.

## Incremental import strategy

The connector should avoid repeatedly importing the entire order history.

Recommended pattern:

```text
Initial import
    beginDate = configured initial date
    endDate   = now
    page through offset/limit

Incremental import
    beginDate = last successful import watermark
    endDate   = current import cut-off time
    page through offset/limit
```

Use an overlap window where appropriate to protect against timing boundaries, and deduplicate using immutable Hepsiburada identifiers such as order/line identifiers.

## Other order states

Hepsiburada exposes different endpoints for different stages of order lifecycle rather than one universal order-history endpoint.

The documentation includes separate operations for, among others:

```text
open / paid orders
packages
cancelled orders
shipped orders
delivered orders
undelivered orders
unpacked packages
```

The Hepsiburada FAQ also states that order retrieval differs according to the merchant's automatic packaging configuration:

```text
Automatic packaging disabled:
    use "Ödemesi Tamamlanmış Siparişler"

Automatic packaging enabled:
    use "Paket Bilgilerini Listeleme"
```



Several historical/status-based order APIs only expose the most recent **one month** of data and support either date filters or limit/offset paging. For cancelled, shipped, delivered and undelivered order services, the documentation states a maximum `limit` of 50.

This makes regular incremental synchronization mandatory if historical lifecycle data is required.

---

# 2.3.9 Required Developer Portal Pages

The Product Owner should attach or paste the current versions of the following Hepsiburada Developer Portal pages into the project documentation:

1. **Başlarken / Getting Started**
   - onboarding
   - environments
   - merchant/integrator model

2. **API Authentication**
   - Basic Auth
   - integrator service key / authorization setup
   - Merchant ID
   - credentials

3. **Listeleme Entegrasyonu / Listing Information**
   - Listing Bilgilerini Sorgulama
   - complete query/filter definition
   - **complete response schema**

4. **Listing Inventory Update**
   - request payload
   - maximum batch size
   - price/stock fields
   - validation rules

5. **Listing Envanter Güncelleme Sorgulama**
   - upload ID
   - canonical batch status enum
   - item-level failure response schema

6. **Buybox Sırasını Getirme**
   - if Buybox ranking is required by the product

7. **Sipariş Entegrasyonu Önemli Bilgiler**
   - authentication
   - order lifecycle
   - commission
   - VAT
   - rate limits

8. **Ödemesi Tamamlanmış Siparişleri Listeleme**
   - complete order response schema
   - `begindate`
   - `enddate`
   - `offset`
   - `limit`

9. **Paket Bilgilerini Listeleme**
   - required if automatic packaging is used

10. **Komisyon Bilgisi Sorgulama**
    - required if commission information is needed before the actual order is imported.

11. **Developer Portal — Changelog**
    - integration changes affecting rate limits, listing fields, order fields and commission behaviour.

---

# 2.3.10 Implementation Checklist / Outstanding Confirmations

Before development is considered specification-complete, the following information must be captured directly from the current Developer Portal:

- [ ] Production URLs for every API group being implemented.
- [ ] Final authentication username/service-key ownership model.
- [ ] Exact required `User-Agent` convention.
- [ ] Full Listing Information endpoint query parameters.
- [ ] **Full Listing Information response JSON schema.**
- [ ] Exact inventory/price update request JSON/XML schema.
- [ ] Exact response returned when an inventory batch is accepted.
- [ ] Exact inventory upload/batch status enum values.
- [ ] **Full batch failure/item failure response schema.**
- [ ] Dedicated Commission Information endpoint request/response schema.
- [ ] Decide whether “Buybox Orders” means Buybox ranking + standard Orders API or a separate business-specific Hepsiburada endpoint.
- [ ] Full open/paid Orders response schema copied from the current Portal.
- [ ] Confirm order-import scope and automatic-packaging mode.
- [ ] Confirm required historical order window and synchronization frequency.

---

## Integration Architecture Summary

Recommended service separation:

```text
HepsiburadaConnector
│
├── Authentication
│
├── CatalogueClient
│     └── product/master-data operations
│
├── ListingClient
│     ├── list/filter listings
│     ├── update inventory
│     ├── update price
│     ├── poll inventory upload
│     └── commission lookup
│
├── BuyboxClient
│     └── buybox ranking
│
└── OrdersClient
      ├── import paid/open orders
      ├── package operations
      ├── cancelled orders
      ├── shipped orders
      ├── delivered orders
      └── undelivered orders
```

The connector should not assume that a successful batch submission means that the underlying listing changes were successfully processed. Listing changes must remain pending until the corresponding upload-status operation confirms their final result.

Likewise, rate limiting should be implemented independently per Hepsiburada API domain because Catalogue, Orders and Listing APIs have different quotas and operational constraints.