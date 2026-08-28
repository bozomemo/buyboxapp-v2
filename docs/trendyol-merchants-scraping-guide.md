# Trendyol Product & Merchant Listing Extraction Guide

## Objective

Given a Trendyol product-detail page, extract product metadata and all merchant offers from the structured application state embedded in the initial HTML.

The extractor must be:

* independent of UI language;
* independent of translated labels;
* independent of CSS classes and visual layout;
* defensive against optional fields;
* explicit about the distinction between product, merchant, variant, and listing.

---

# 1. Primary Source

The preferred source is the serialized application state assigned to:

```javascript
window["__envoy__SHARED_PROPS"]
```

Extraction flow:

```text
Product URL
    ↓
Initial HTML response
    ↓
<script> containing "__envoy__SHARED_PROPS"
    ↓
Deserialize assigned JSON object
    ↓
product
    ↓
merchantListing
```

Do not use DOM scraping or browser automation if the required information already exists in this structured state.

---

# 2. Locate the Embedded State

Search `<script>` contents for:

```text
__envoy__SHARED_PROPS
```

Do not depend on:

```text
script index
DOM position
CSS class
translated UI labels
```

Locate the JavaScript assignment and extract the full balanced JSON object.

Avoid regex patterns such as:

```regex
\{.*?\}
```

because the payload contains deeply nested objects and arrays.

Use balanced-brace parsing while respecting quoted JSON strings.

---

# 3. Product Root

After deserialization, the primary product object is:

```text
$.product
```

Important product-level fields observed include:

```text
$.product.id
$.product.name
$.product.productCode
$.product.productGroupId
$.product.brand
$.product.category
$.product.categoryTree
$.product.webCategory
$.product.webCategoryTree
$.product.images
$.product.ratingScore
$.product.attributes
$.product.variants
$.product.merchantListing
```

Fields must be treated as optional unless required for extraction validation.

---

# 4. Critical Merchant Structure

`product.merchantListing` is **not an array**.

It is an object containing the current/winning merchant and additional merchants.

Canonical structure:

```text
$.product.merchantListing
├── merchant
├── winnerVariant
├── variants
├── promotions
├── campaign
├── otherMerchants[]
├── hasLocationBasedSales
└── ...
```

Therefore the agent MUST NOT perform:

```python
for merchant in product["merchantListing"]:
    ...
```

That would iterate object keys, not merchants.

---

# 5. Two Seller Sources

All seller offers are constructed from two sources.

## A. Current / Winning Merchant

Merchant identity:

```text
$.product.merchantListing.merchant
```

Commercial listing:

```text
$.product.merchantListing.winnerVariant
```

Associated promotions:

```text
$.product.merchantListing.promotions
```

Associated campaign:

```text
$.product.merchantListing.campaign
```

## B. Other Merchants

Additional merchants:

```text
$.product.merchantListing.otherMerchants[]
```

Each element already combines merchant identity with offer-related data such as:

```text
id
name
sellerScore
price
variants[]
promotions[]
url
freeCargo
rushDelivery
corporateInvoiceApplicable
```

---

# 6. Current Merchant Must Be Joined With Winner Variant

The current merchant identity and its commercial offer are stored separately.

Example conceptual relationship:

```text
merchant
├── id
├── name
├── sellerScore
└── merchant metadata

winnerVariant
├── listingId
├── itemNumber
├── price
├── quantity
├── stockStatus
├── barcode
├── fulfilmentType
└── delivery/listing metadata
```

Therefore construct the winner offer as:

```text
merchant identity
        +
winnerVariant
        +
merchantListing.promotions
        +
merchantListing campaign metadata
```

Do not expect:

```text
merchant.price
merchant.listingId
```

to exist.

---

# 7. Seller Enumeration Algorithm

The normalized seller collection should be built as:

```text
normalized offers
    =
1 offer generated from merchant + winnerVariant
    +
N offers generated from otherMerchants[]
```

Conceptually:

```python
merchant_listing = product.get("merchantListing") or {}

offers = []

merchant = merchant_listing.get("merchant")
winner = merchant_listing.get("winnerVariant")

if merchant and winner:
    offers.append(
        normalize_winner(
            merchant=merchant,
            variant=winner,
            promotions=merchant_listing.get("promotions", []),
            campaign=merchant_listing.get("campaign")
        )
    )

for other in merchant_listing.get("otherMerchants", []):
    offers.extend(normalize_other_merchant(other))
```

The winner merchant MUST NOT be lost merely because it is absent from `otherMerchants`.

---

# 8. Merchant Identity

For the winning merchant:

```text
merchant.id
```

is the primary merchant ID.

For other merchants:

```text
otherMerchants[i].id
```

is the primary merchant ID.

Normalize both to:

```text
merchant_id
```

Do not use seller name as the identifier.

Example:

```json
{
  "merchant_id": 736424,
  "seller_name": "Cansu Beauty"
}
```

---

# 9. Seller Score

Seller score is an object:

```text
sellerScore.value
sellerScore.color
```

For data processing use:

```text
sellerScore.value
```

Do not parse the score from UI text or color.

Normalize:

```json
{
  "seller_score": 9.2
}
```

The color field is presentation metadata and should normally not be treated as business data.

---

# 10. Listing Identity

The commercial listing identifier is stored at variant level.

For the winner:

```text
$.product.merchantListing.winnerVariant.listingId
```

For another merchant:

```text
$.product.merchantListing.otherMerchants[i].variants[j].listingId
```

Normalize to:

```text
listing_id
```

Merchant ID and listing ID have different meanings.

Never use them interchangeably.

Recommended uniqueness key:

```text
merchant_id + listing_id
```

When variant-level uniqueness is required, also retain:

```text
itemNumber
barcode
```

---

# 11. Important Distinction: Merchant vs Variant vs Listing

The data model should be understood approximately as:

```text
Product
└── Merchant
    └── Variant / Listing
```

For example:

```text
product.id
    identifies product page/product entity

merchant.id
    identifies seller

variant.itemNumber
    identifies item/variant

variant.listingId
    identifies commercial listing

variant.barcode
    identifies barcode/SKU representation
```

Do not collapse these identifiers into a single ID.

---

# 12. Other Merchants May Contain Multiple Variants

Do not permanently assume:

```python
other["variants"][0]
```

is the only possible listing.

The supplied sample currently contains one variant per other merchant, but the schema uses an array:

```text
otherMerchants[].variants[]
```

Therefore the extractor should support:

```text
one merchant
    ↓
one or more listing variants
```

Recommended behavior:

```python
for merchant in other_merchants:
    variants = merchant.get("variants") or []

    for variant in variants:
        emit_offer(merchant, variant)
```

This prevents future multi-variant products from losing listings.

---

# 13. Other Merchant Price vs Variant Price

For other merchants, price information exists at two levels in the observed payload:

```text
otherMerchant.price
```

and:

```text
otherMerchant.variants[].price
```

The sample shows them containing the same effective price.

For listing-specific extraction, prefer:

```text
variants[].price
```

because `listingId` and the actual commercial variant belong to the same object.

Treat:

```text
otherMerchant.price
```

as merchant-level/current-display offer information or fallback.

Recommended precedence:

```text
variant.price
    ↓ fallback
merchant.price
```

Do not assume the two will always remain identical.

---

# 14. Winner Price

For the winning merchant, use:

```text
merchantListing.winnerVariant.price
```

This contains:

```text
currency
discountedPrice
sellingPrice
originalPrice
rrp
discountPercentage
couponApplicablePrice
tyPlusCouponApplicablePrice
discountedPriceAfterNoLimitPromotions
```

Example machine-readable extraction:

```text
price.currency
price.discountedPrice.value
price.sellingPrice.value
price.originalPrice.value
```

Do not use localized `.text` values as canonical numeric data.

---

# 15. Price Normalization

Prefer numeric fields:

```text
value
```

over formatted fields:

```text
text
```

For example:

```json
{
  "currency": "TRY",
  "discountedPrice": {
    "value": 35010,
    "text": "35.010 TL"
  }
}
```

Normalize as:

```json
{
  "currency": "TRY",
  "discounted_price": 35010
}
```

Do not parse:

```text
"35.010 TL"
```

because it is locale-dependent presentation text.

---

# 16. Do Not Parse Invalid RRP Text

The supplied structure may contain:

```json
{
  "rrp": {
    "text": "NaN TL"
  }
}
```

This MUST NOT be interpreted as a numeric price.

If no valid numeric:

```text
rrp.value
```

exists, normalize RRP as:

```json
null
```

Never attempt to derive a number from `"NaN TL"`.

---

# 17. Stock and Availability

Variant/listing-level fields may include:

```text
sellable
inStock
stockStatus
quantity
isRunningOut
runningOutQuantity
maxSaleLimit
```

These should remain separate because they represent different concepts.

Recommended normalized model:

```json
{
  "stock": {
    "sellable": true,
    "in_stock": true,
    "stock_status": 1,
    "quantity": 4,
    "is_running_out": true,
    "running_out_quantity": 0,
    "max_sale_limit": 2
  }
}
```

Do not derive all availability from `quantity` alone.

---

# 18. Delivery / Fulfillment Fields

Variant-level listing fields include:

```text
fulfilmentType
rushDeliveryDuration
freeCargo
hasCollectable
isFasterMerchantAvailable
```

Merchant-level fields may also contain:

```text
rushDelivery
freeCargo
```

Prefer listing/variant-specific values when available.

Example priority:

```text
variant.freeCargo
    ↓ fallback
merchant.freeCargo
```

Store fulfillment separately:

```json
{
  "fulfillment": {
    "type": "mp",
    "free_cargo": true,
    "rush_delivery": true,
    "rush_delivery_duration": 24,
    "collectable": false
  }
}
```

Note the actual source property spelling:

```text
fulfilmentType
```

with one `l` after `fulfil`.

Do not silently rename the input path during extraction logic.

Normalization may use:

```text
fulfillment_type
```

internally.

---

# 19. Promotions

Winner promotions:

```text
$.product.merchantListing.promotions[]
```

Other seller promotions:

```text
$.product.merchantListing.otherMerchants[i].promotions[]
```

Important machine-oriented fields include:

```text
id
discountType
promotionDiscountType
promotionEndDate
isLimitSatisfied
isApplied
isOnlyAz
isTyPlus
```

Natural-language fields such as:

```text
name
shortName
```

must not be used for classification when structured fields exist.

For example, prefer:

```text
promotionDiscountType == "Cargo"
```

instead of checking whether:

```text
"Kargo Bedava"
```

appears in the name.

This is essential for language independence.

---

# 20. Badge and Tag Handling

Merchant badges:

```text
merchant.merchantBadges[]
otherMerchants[].merchantBadges[]
```

Listing tags:

```text
variant.tagDetails[]
```

For logic, prefer stable identifiers such as:

```text
tagId
tag
type
```

over translated values such as:

```text
displayName
```

For example:

```text
tag = "installment_pft9"
```

is preferable for machine processing to:

```text
displayName = "Peşin Fiyatına 9 Taksit"
```

Do not assume natural-language display strings are stable.

---

# 21. Product-Level Variants Are Different

There are multiple variant-related locations.

Observed examples include:

```text
$.product.variants[]
```

and:

```text
$.product.merchantListing.variants[]
```

and:

```text
$.product.merchantListing.winnerVariant
```

and:

```text
$.product.merchantListing.otherMerchants[].variants[]
```

They must not be treated as interchangeable.

Conceptually:

```text
product.variants
    → product-level selected/available variant summary

merchantListing.variants
    → current merchant-related variant summary

merchantListing.winnerVariant
    → winning commercial listing details

otherMerchants[].variants
    → competitor merchant commercial listings
```

For price/stock/listing extraction, commercial variant objects are the primary source.

---

# 22. Winner Merchant Normalization

Winner offer should be normalized approximately as:

```json
{
  "merchant_id": 736424,
  "seller_name": "Cansu Beauty",
  "seller_score": 9.2,

  "listing_id": "6977358e4229a736c25b131ecb61f8eb",
  "item_number": 997897761,
  "barcode": "5025155088180",

  "is_winner": true,

  "price": {
    "currency": "TRY",
    "discounted_price": 35010,
    "selling_price": 35010,
    "original_price": 35010
  },

  "stock": {
    "sellable": true,
    "in_stock": true,
    "quantity": 4
  }
}
```

The winner flag is derived from its location under:

```text
winnerVariant
```

It does not need to be inferred from lowest price.

---

# 23. Other Merchant Normalization

For every:

```text
otherMerchants[i]
```

and each corresponding:

```text
variants[j]
```

construct an offer:

```json
{
  "merchant_id": 514600,
  "seller_name": "SATÜRN",
  "seller_score": 9.0,

  "listing_id": "260d03dd4e1a963dc138b6c1951238ce",
  "item_number": 997897761,
  "barcode": "5025155088180",

  "is_winner": false,

  "price": {
    "currency": "TRY",
    "discounted_price": 39999,
    "selling_price": 39999,
    "original_price": 39999
  },

  "stock": {
    "sellable": true,
    "in_stock": true,
    "quantity": 13
  }
}
```

---

# 24. Correct Seller Count

Do not calculate seller count simply as:

```text
len(otherMerchants)
```

because the winner merchant is stored separately.

For merchant count:

```text
merchant_count =
    (1 if merchant exists else 0)
    +
    len(otherMerchants)
```

For listing/offer count, count emitted variant listings instead:

```text
winnerVariant
+
all otherMerchants[].variants[]
```

Merchant count and listing count are different metrics.

---

# 25. Recommended Extraction Paths

## Product

```text
$.product
```

## Product ID

```text
$.product.id
```

## Winner Merchant

```text
$.product.merchantListing.merchant
```

## Winner Listing

```text
$.product.merchantListing.winnerVariant
```

## Winner Promotions

```text
$.product.merchantListing.promotions
```

## Other Merchants

```text
$.product.merchantListing.otherMerchants[*]
```

## Other Merchant Listings

```text
$.product.merchantListing.otherMerchants[*].variants[*]
```

## Product Variants

```text
$.product.variants[*]
```

These paths should be documented and monitored independently.

---

# 26. Language-Independent Parsing Rules

The agent MUST NOT use values such as:

```text
"Dik Süpürge"
"Kargo Bedava"
"Peşin Fiyatına 9 Taksit"
"Elektronik"
"TÜRKİYE"
```

as structural selectors.

These are business/display values and may be localized.

Use field names, IDs, enums, booleans, and structured paths.

Prefer:

```text
category.id
promotionDiscountType
tagId
tag
merchant.id
listingId
currency
```

over:

```text
category.name
promotion.name
tag.displayName
merchant.name
price.text
```

Names may be retained as output data, but they must not determine parsing behavior.

---

# 27. Product Attributes

Product attributes follow a structured schema:

```text
$.product.attributes[]
```

Each attribute may contain:

```text
key.id
key.name
value.id
value.name
type
typeId
searchable
isStarred
```

For language-independent attribute identity prefer:

```text
key.id
typeId
type
```

over:

```text
key.name
```

Likewise prefer:

```text
value.id
```

when semantic identity is needed.

Human-readable names may still be retained for display.

---

# 28. Category Identity

There are several category representations:

```text
product.category
product.categoryTree
product.webCategory
product.webCategoryTree
```

Do not assume their IDs come from the same namespace.

For example:

```text
category.id
```

and:

```text
webCategory.id
```

can refer to conceptually similar categories but have different IDs.

Preserve them separately if downstream logic needs both.

---

# 29. Sensitive Merchant Metadata

The winner merchant object may include business/contact information such as:

```text
officialName
registeredEmailAddress
taxNumber
taxOffice
address
cityName
countryName
```

Only collect and retain these fields if they are required for the intended application.

Do not include unnecessary merchant personal/business contact data in the normalized offer schema.

A typical pricing/seller scraper usually needs only:

```text
merchant_id
seller_name
seller_score
badges
invoice capability
offer/listing information
```

---

# 30. Recommended Normalized Output

Recommended scraper-owned schema:

```json
{
  "source": "trendyol",

  "product": {
    "id": 757251065,
    "product_code": "448884-01",
    "product_group_id": 576024781,
    "name": "V12 Detect Slim™ Absolute Kablosuz Süpürge",

    "brand": {
      "id": 13078,
      "name": "DYSON"
    }
  },

  "offers": [
    {
      "merchant_id": 736424,
      "seller_name": "Cansu Beauty",
      "seller_score": 9.2,

      "listing_id": "6977358e4229a736c25b131ecb61f8eb",
      "item_number": 997897761,
      "barcode": "5025155088180",

      "is_winner": true,

      "price": {
        "currency": "TRY",
        "discounted_price": 35010,
        "selling_price": 35010,
        "original_price": 35010
      },

      "stock": {
        "sellable": true,
        "in_stock": true,
        "quantity": 4,
        "stock_status": 1,
        "is_running_out": true
      },

      "fulfillment": {
        "type": "mp",
        "free_cargo": true,
        "rush_delivery_duration": 24
      }
    }
  ]
}
```

Use `offers` rather than blindly calling every record a merchant because one merchant can theoretically expose multiple listing variants.

---

# 31. Recommended Agent Algorithm

For every Trendyol product URL:

1. Fetch initial HTML.
2. Locate the `<script>` containing `__envoy__SHARED_PROPS`.
3. Extract its complete JSON assignment.
4. Deserialize JSON.
5. Read `$.product`.
6. Validate that `product` is an object.
7. Read `$.product.merchantListing`.
8. Validate that `merchantListing` is an object.
9. Read `merchantListing.merchant`.
10. Read `merchantListing.winnerVariant`.
11. If both exist, emit the winner offer by joining them.
12. Read `merchantListing.otherMerchants`.
13. For every other merchant, iterate its `variants[]`.
14. Emit one normalized offer per listing variant.
15. Use variant-level price/stock data when available.
16. Use merchant-level price/availability only as fallback.
17. Store merchant IDs and listing IDs separately.
18. Use numeric price values, never localized price text.
19. Mark the `winnerVariant` offer as `is_winner=true`.
20. Mark other merchant offers as `is_winner=false`.
21. Record extraction metadata and schema version.

---

# 32. Defensive Schema Checks

Expected current types:

```text
product                         → object
product.merchantListing         → object
merchantListing.merchant        → object/null
merchantListing.winnerVariant   → object/null
merchantListing.otherMerchants  → array
otherMerchant.variants          → array
variant.price                   → object
```

If `merchantListing` unexpectedly becomes an array, do not silently process it using the existing schema.

Record:

```text
schema mismatch
```

and invoke schema-discovery/fallback logic.

---

# 33. Schema Monitoring

Recommended metrics:

```text
shared_props_found
product_found
merchant_listing_found

winner_merchant_found
winner_variant_found

other_merchant_count
merchant_count
listing_count

parser_version
schema_version
extraction_method
```

Example:

```json
{
  "shared_props_found": true,
  "product_found": true,
  "merchant_listing_found": true,

  "winner_merchant_found": true,
  "winner_variant_found": true,

  "other_merchant_count": 6,
  "merchant_count": 7,
  "listing_count": 7,

  "extraction_method": "embedded_json",
  "parser_version": "2.0"
}
```

---

# 34. Completeness Validation

The correct conceptual completeness check is not merely:

```text
merchantListing exists
```

Validate:

```text
winner merchant/listing presence
+
otherMerchants collection
+
variant listings
```

During development, compare the normalized merchant/listing count with the UI or network payload on representative products.

Once validated, normal production scraping can remain HTTP-only.

---

# 35. Canonical Current Structure

Based on the supplied product payload, the currently observed structure is:

```text
__envoy__SHARED_PROPS
└── product
    ├── id
    ├── productCode
    ├── brand
    ├── category
    ├── attributes
    ├── variants
    │
    └── merchantListing
        ├── merchant
        │   ├── id
        │   ├── name
        │   └── sellerScore
        │
        ├── winnerVariant
        │   ├── listingId
        │   ├── itemNumber
        │   ├── barcode
        │   ├── price
        │   ├── quantity
        │   └── stock / fulfillment fields
        │
        ├── promotions[]
        ├── campaign
        ├── variants[]
        │
        └── otherMerchants[]
            ├── id
            ├── name
            ├── sellerScore
            ├── price
            ├── promotions[]
            ├── url
            │
            └── variants[]
                ├── listingId
                ├── itemNumber
                ├── barcode
                ├── price
                ├── quantity
                └── stock / fulfillment fields
```

---

# 36. Final Instruction for the AI Agent

When extracting offers from a Trendyol product page, treat `product.merchantListing` as a merchant-listing container, **not as a merchant array**.

Construct the complete offer set from:

```text
merchantListing.merchant
        +
merchantListing.winnerVariant
```

for the winning/current offer, and:

```text
merchantListing.otherMerchants[*]
        +
each merchant's variants[*]
```

for competing offers.

Use IDs, structured enums, numeric values, booleans, and JSON paths for parsing. Never depend on Turkish or other localized UI text. Prefer listing/variant-level price, stock, and fulfillment fields over merchant-level display summaries. Normalize all source shapes into a scraper-owned `offers[]` schema so downstream consumers remain isolated from Trendyol frontend schema changes.

---

# 37. Implementation notes (BuyBoxApp, 2026-08-13)

This section records what happened when the guide above was implemented — where the code
lives, which rules needed a decision the guide left open, and which assumptions should be
re-verified against a live page. The sections above remain the specification; this one is the
log of applying them.

## 37.1 Where it lives

| Concern | File |
|---|---|
| Port every marketplace's scraper implements | `packages/adapters/src/ports/competitor-source.ts` |
| §1, §2 — marker search, balanced-brace extraction | `packages/adapters/src/trendyol/public-page/shared-props.ts` |
| §4–§33 — normalisation into `offers[]` | `packages/adapters/src/trendyol/public-page/normalize.ts` |
| Fetch, rate limit, cache, user agent, URL building | `packages/adapters/src/trendyol/public-page/source.ts` |
| Recorded page fixture | `packages/adapters/src/trendyol/fixtures/public-page.html` |
| Tests, keyed to this guide's section numbers | `packages/adapters/src/trendyol/public-page/public-page.test.ts` |
| The job that uses it | `packages/jobs/src/pipeline/scrape-competitors.ts` |

Operating constraints (rate limit, cache, tiering, user agent, off-by-default) are recorded in
`api-references.md` §1.6 and `08-configuration-and-constants.md` §12.

## 37.2 Decisions the guide left open

- **Price unit.** §15's example pairs `value: 35010` with `text: "35.010 TL"`. In tr-TR the
  dot is a thousands separator, so that is 35 010 ₺ and `value` is in **lira**, not kuruş. The
  adapter converts it to exact kuruş once, via a decimal string. ⚠️ **Re-verify this against a
  live page before enabling live scraping** — every downstream price is wrong by 100× if it is
  ever kuruş.
- **Which price is "the" price.** doc 01 §7 already maps the domain's competitor
  `sellingPrice` to `discountedPrice` and its `basketDiscountPrice` to `couponApplicablePrice`.
  That mapping is kept. Where no coupon price exists, the final price is the shelf price
  rather than `null`, which downstream would read as "unknown".
- **Stock (§17).** `competitor_observations` stores a single offered-stock integer (doc 05 §5),
  so the several availability fields are reduced explicitly: an offer the page marks
  `sellable: false` or `inStock: false` is 0; otherwise `quantity` if present; otherwise
  `null`. Never a guessed number, and never all derived from `quantity` alone.
- **Dispatch time (§18).** The page exposes `rushDeliveryDuration` in **hours**;
  `listings.dispatch_time` holds **days** from the Seller API. Mapping one onto the other
  would be a unit error, so competitor dispatch time is left `null`.
- **Unnamed sellers.** doc 05 §5 types `seller_name` as non-null. An offer with no name is
  stored as an empty string — never a sentinel like the legacy `"No Seller"` (doc 08 §10).
- **Change detection hashes normalised offers, not the HTML.** A Trendyol page carries session
  ids, A/B flags and recommendation blocks that change on every load; hashing the response
  body would mark every scrape as changed and defeat the two-tier design in doc 10 §5.

## 37.3 Additions beyond the guide

- **`JSON.parse("…")` assignments** are handled as well as bare object literals: some page
  variants assign the state as an escaped string. §2's balanced-brace rule still applies to
  the decoded contents.
- **Merchant-level price fallback (§13)** is implemented in the stated precedence
  (`variant.price` → `merchant.price`), and covered by a test, even though the observed sample
  had them identical.
- **Sensitive merchant metadata (§29)** is asserted absent from the normalised output by a
  test, not merely omitted by convention: `taxNumber`, `registeredEmailAddress` and
  `officialName` are read from the payload by nothing.
- **`merchantListing` arriving as an array (§32)** raises a typed schema error and is recorded
  as `scrape_runs.status = 'parseFailed'`. It is never processed with the current rules, since
  plausible-looking wrong data is worse than a recorded failure.
- **`merchantId` is stripped from the request URL (found 2026-08-17).** The captured
  `productUrl` (api-references §1.4) carries `merchantId=<our own seller id>` in its query
  string. Fetching the public page with that query present is not neutral: the embedded state
  comes back reporting our own offer as `winnerVariant` on every row regardless of the real
  buybox order — observed live where the official buybox endpoint reported rank 8 for a product
  the scraped page reported us 1st on. `TrendyolPublicPageSource.buildUrl` (`source.ts`) always
  removes `merchantId` before requesting; `filterOverPriceListings` and any other query param
  are left as-is. Covered by a test in `public-page.test.ts`.

- **§29's merchant metadata is read by a second, separate path — never by the scraper**
  (added 2026-08-28). `public-page/normalize.ts` still asserts, by test, that `taxNumber`,
  `registeredEmailAddress` and `officialName` never reach the offer schema: collecting a firm's
  registration as a side effect of every price scrape is exactly what §29 warns against.
  `seller-identity/normalize.ts` reads them deliberately, one seller at a time, from a page
  requested as that merchant (`?merchantId=X`, api-references §1.6a). That module reads
  `winnerVariant` for a barcode and a stock count and never for winner-ness, does not look at
  `otherMerchants` at all, and refuses outright when `merchant.id` is not the id that was asked
  for — a page about a different firm parses perfectly and is the one result that must never be
  stored.

## 37.4 What would tell us the payload changed

Every run records the §33 diagnostics. The signals worth alerting on are a fall in
`winnerVariantFound` or `merchantCount`, or a rise in `parseFailed` — all of which show up as
a `scrape_runs` status distribution rather than as quietly empty reports, which is precisely
how the retired scraper failed (doc 09 §22).
