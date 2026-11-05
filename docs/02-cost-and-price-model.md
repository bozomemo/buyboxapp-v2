# 02 — Cost & Price Model (target specification)

This is the mathematical core. Everything in doc 03 sits on top of it. This document
specifies what the **new** system must implement. Where the legacy system differs, the
difference is called out — the legacy behaviour is a bug unless explicitly stated otherwise.

Implementation home: `packages/core`. Pure functions, no I/O, fully unit-tested against the
vectors in §7.

---

## 0. No VAT in any price calculation — product owner's decision, 2026-11-03

**No calculation in this system applies VAT (KDV).** Not the floor price, not net proceeds,
not the repricing engine, not a preview, not a report. There is no product VAT rate, no
commission VAT gross-up, no deductibility switch.

This works because **every amount is on one basis — VAT-inclusive**, the basis the marketplace
quotes its selling price on:

| Amount | Entered as |
|--------|-----------|
| Unit cost (`stock_items.unit_cost`, brand product unit price) | VAT-inclusive, what is actually paid |
| Selling price | VAT-inclusive (as the marketplace states it) |
| Commission rate | as the marketplace states it, applied to the selling price |
| Cargo, expenditure, fixed fees | VAT-inclusive, what is actually paid |

With every amount on the same basis and the same VAT rate on purchase, sale and fees, whether a
price makes or loses money comes out right without a VAT term. Where the rates differ (a 1 % or
10 % VAT product against 20 % on commission and cargo) the result is slightly off; the product
owner accepted that.

> ⚠️ **This deliberately reverses the previous version of §6.1**, which called the VAT-less
> legacy floor a defect. That reasoning holds only when unit cost is entered **VAT-exclusive**
> against a VAT-inclusive price. Entering unit cost VAT-exclusive under this model produces a
> floor that is too low, so a cost source that supplies VAT-exclusive figures must be converted
> before import. Recorded in doc 09 §34.
>
> The database keeps its VAT columns (`fee_settings.*vat*`, `listings.vat_rate`,
> `price_submissions.vat_rate`, `repricing_state.optimum_ctx_vat_rate`) so history is not
> destroyed. Nothing reads them for a calculation; new fee rows write the values that mean "no
> VAT" (`packages/db` `RETIRED_VAT_COLUMNS`). `listings.vat_rate` is still imported from the
> marketplace and may be displayed.

---

## 1. Money representation

**All monetary values are `bigint` in minor units (kuruş).** Never `number`, never `float`,
in any layer.

- Parse at the adapter boundary: `149.90` → `14990n`.
- Format at the display boundary only.
- Rates and multipliers (commission %, ratios) are `number`, since they are not money.
- Rounding: **half-up to the nearest kuruş**, applied once, at the end of a calculation chain.
  Never round intermediate values.

> The legacy system uses `double` in C# and `double` in MySQL for every price and cost. This
> is a defect, not a style choice.

---

## 2. Inputs and where they come from

| Input | Symbol | Source | Notes |
|-------|--------|--------|-------|
| Unit cost | `U` | ERP / stock item | **VAT-inclusive** (§0) |
| Selling price | `P` | Marketplace listing | VAT-inclusive (what the customer is quoted) |
| Commission rate | `c` | Marketplace listing API (`commission` / `commissionRate`) | Used as stated |
| Cargo bands | `K(·)` | Config | Amounts used as entered |
| Expenditure bands | `E(·)` | Config | Amounts used as entered |
| Campaign final price | `Pf` | Marketplace (`priceSeenByCustomer` / `finalPrice`) | What the customer actually pays |
| Store share of campaign | `s` | Marketplace (HB `debtors`) | % of the discount we fund |

---

## 3. Fee settings (per marketplace, effective-dated)

```ts
interface FeeSettings {
  effectiveFrom: Date;
  defaultCommissionRate: number;        // fallback when the API omits it
  cargoBands: { maxPrice: bigint | null; amount: bigint }[];   // ordered, first match wins
  expenditureBands: { minPrice: bigint; amount: bigint }[];    // ordered, first match wins
}
```

Band amounts are used exactly as configured — there is no VAT normalisation (§0).

---

## 4. Unit cost `U`

```
unitCost(stockCode, marketplace) -> Result<Money, CostError>:

    parsed = StockCode.parse(stockCode)        # doc 01 §2; may fail
    if parsed is error: return CostError.UnparseableStockCode

    if parsed.isBundle:
        members = bundleMembers(parsed)
        if members is empty: return CostError.BundleNotDefined
        total = 0
        for m in members:
            memberCost = unitCost(m.stockCode, marketplace)   # recursive
            if memberCost is error: return CostError.BundleMemberUnknown
            total += memberCost × m.quantity
        return total

    item = stockItem(parsed.baseCode)
    if item is missing: return CostError.StockItemNotFound

    multiplier = pricePreference(parsed.baseCode, marketplace).priceMultiplier
    return item.unitCost × parsed.unitCount × multiplier
```

`originalUnitCost` is the same with `multiplier = 1`.

> **Mandatory change from legacy.** The legacy system returns the sentinel `999` (C#) or `-1`
> (SQL) on failure and lets it flow into the price formula. **A cost error must exclude the
> listing from automation and raise an operator alert.** Never produce a price from an unknown
> cost. See doc 09 §7.

The recursion must be depth-limited (suggest 5) and cycle-detected; a bundle containing itself
must return `CostError.BundleCycle`.

---

## 5. The two core functions

### 5.1 Net proceeds — `netProceeds(P)`

*Given a selling price, what actually reaches our account?*

```
netProceeds(P, c, campaign, fees):

    # 1. Campaign: what the customer pays, and who funds the discount
    Pf                = campaign ? campaign.finalPrice : P
    totalDiscount     = P - Pf
    storeDiscount     = totalDiscount × (campaign ? campaign.storeSharePct/100 : 0)
    marketplaceRefund = totalDiscount - storeDiscount

    # 2. Commission, on the price net of our share of the discount
    commission = (P - storeDiscount) × c/100

    # 3. Fixed costs, chosen from the price the customer sees
    cargo       = cargoBand(Pf).amount
    expenditure = expenditureBand(Pf).amount

    return Pf - commission - cargo - expenditure + marketplaceRefund
```

With no campaign this reduces to:

```
netProceeds = P - P × c/100 - cargo - expenditure
```

### 5.2 Floor price — `floorPrice(U)`

*What must I charge so that net proceeds exactly equal my cost?*

Solve `netProceeds(P) = U` for `P`. With no campaign:

```
floorPrice = (U + cargo + expenditure) / (1 - c/100)
```

Let `D = 1 - c/100` — the **net retention factor**.

With a campaign, the price we set is `P` but the customer pays `Pf = P × r` where
`r = campaignRatio`. Substituting and solving:

```
D_campaign = r - (1 - (1-r) × s/100) × c/100 + (1-r) × (1 - s/100)

floorPrice = (U + cargo + expenditure) / D_campaign
```

### 5.3 The band circularity, and how to resolve it

Cargo and expenditure depend on the price, but the price is what we are solving for. Resolve
by **iterating to a fixed point** rather than the legacy's hand-unrolled band descent:

```
floorPrice(U, c, campaign, fees):
    D = retentionFactor(c, campaign)
    if D <= 0: return PriceError.NotProfitableAtAnyPrice

    P = (U + fees.cargoBands.last.amount + fees.expenditureBands.last.amount) / D   # upper seed
    for i in 0..MAX_ITERATIONS (5):
        cargo       = cargoBand(customerPrice(P, campaign)).amount
        expenditure = expenditureBand(customerPrice(P, campaign)).amount
        next        = (U + cargo + expenditure) / D
        if bandsOf(next) == bandsOf(P): return roundUpToKurus(next)
        P = next
    return roundUpToKurus(P)     # did not settle; return the last, conservative value
```

Seeding from the **highest** band and converging downward guarantees the result is never
below the true floor, which is the safe direction. If the iteration oscillates between two
adjacent bands (possible exactly at a band edge), take the **higher** price. Where two fixed
points exist (a cost whose floor would be self-consistent in both a cheaper and a dearer cargo
band), the higher one is returned for the same reason.

`D <= 0` means no price is profitable — the commission takes all of the revenue. Return an
error; do not produce a price.

> **This replaces the legacy `calcMinPrice` band descent entirely.** The legacy version tests
> the cost against `(threshold − 0.01) × m − nextBandCargo`, an approximation that is wrong at
> band edges and impossible to reason about. See doc 09.

---

## 6. What changed from the legacy model, and why it matters

### 6.1 VAT — superseded by §0

Until 2026-11-03 this section required a product VAT term, on the grounds that the legacy floor
`(U + cargo) / (1 − c/100)` compared a VAT-exclusive cost to a VAT-inclusive price. The product
owner removed VAT from every calculation instead and moved unit cost onto the VAT-inclusive
basis (§0), which removes the mismatch that made the legacy formula wrong. The VAT-less algebra
is now the specified model; what remains a defect is entering a **VAT-exclusive** cost into it.

> 📌 **Settlement validation is deferred.** The product owner cannot yet compare against a real
> statement. What validation confirms is the **input parameters** (cargo bands, expenditure
> bands, the commission rate actually charged), and those are configuration, not code. Ship
> provisional defaults, mark them as provisional in the UI, and treat validation as a **hard
> gate before enabling live writes** (doc 12 Phase 8.3b). Sources when it happens: Trendyol
> `getSettlements` and `getCargoInvoiceItems`; Hepsiburada order `commission.amount`.

### 6.2 Campaign economics are now read from the API, not scraped

Trendyol exposes `priceSeenByCustomer`; Hepsiburada exposes `pricings[].finalPrice` and the
`debtors` split. The legacy system derived a "basket ratio" by dividing a **scraped** price by
the API price. Do not reproduce that.

### 6.3 One implementation, not three

The legacy has the same formulas in C# (`HBAutoBB`, dead), in MySQL stored functions (live),
and in a second C# form for Trendyol (`Functions`), all with different constants and band
edges. `packages/core` is the only home.

### 6.4 Expenditure ladder is now real

The legacy SQL has a five-tier expenditure ladder (`SFGETEXPENDITURE`) that is never called —
only tier 1 is applied. The band model above implements it properly.

---

## 7. Test vectors

These are the acceptance tests for `packages/core`. Values in kuruş. Rewritten 2026-11-03 for
the VAT-less model (§0); the previous VAT-based vectors are in git history.

### 7.1 Retention factor

| `c` | `D` |
|-----|-----|
| 16.00 | 21/25 = 0.84 |
| 7.83 | 9217/10000 |
| 45.00 | 11/20 = 0.55 |
| 0 | 1 |
| 100 | **0 → error** |

### 7.2 Floor price — no campaign

Fees: cargo bands `[{maxPrice: 3000, amount: 476}, {maxPrice: 7500, amount: 900}, {maxPrice: null, amount: 1100}]`,
no expenditure.

| `U` | `c` | Expected floor | Selected cargo band |
|-----|-----|----------------|---------------------|
| 2000 | 16 | 3453 | 900 (2900 / 0.84 = 3452.38) |
| 1000 | 16 | 1758 | 476 (1476 / 0.84 = 1757.14) |
| 5000 | 16 | 7024 | 900 (5900 / 0.84 = 7023.81) |
| 500 | 7.83 | 1059 | 476 (976 / 0.9217 = 1058.92) |
| 5000 | 45 | 11091 | 1100 (6100 / 0.55 = 11090.91) |

Row 1 has a second, lower self-consistent solution — (2000 + 476) / 0.84 = 2947.62 sits inside
the 476 band — and §5.3 deliberately returns the higher one.

> Implementers: compute these from the formula, assert equality, and treat any deviation as a
> bug in the implementation — not in the table. If the table itself is wrong, fix it here and
> record why.

### 7.3 Band-edge behaviour

- A cost whose floor lands exactly on a band boundary must resolve to the **higher** price.
- A cost whose fixed-point iteration oscillates between two bands must resolve to the
  **higher** price.
- `floorPrice` must be monotonically non-decreasing in `U`. Property-test this across the
  full cost range — a band-selection bug shows up immediately as a non-monotonic step.

### 7.4 Round-trip

For any price `P` above the floor:
`netProceeds(floorPrice(U)) ≈ U` within one kuruş.

This is the single most valuable invariant. Property-test it across commission rates,
campaign ratios and cargo bands.

### 7.5 Unit cost

| Stock code | Base cost | Multiplier | Expected | Note |
|------------|-----------|------------|----------|------|
| `12345` | 1000 | 1.0 | 1000 | no dash |
| `12345-4` | 1000 | 1.0 | 4000 | multi-pack |
| `12345-4.2` | 1000 | 1.0 | 4000 | decimal suffix discarded |
| `12345-4` | 1000 | 1.2 | 4800 | multiplier applied |
| `12345-k2` | — | — | Σ members | bundle |
| `99999-1` | — | — | `CostItemNotFound` | **not** 999 |
| `12345-k9` (undefined) | — | — | `BundleNotDefined` | **not** 999 |

---

## 8. Derived indicators

| Indicator | Definition |
|-----------|------------|
| `inBuybox` | Trendyol: `buyboxOrder == 1`. Hepsiburada: buybox rank service says rank 1 |
| `sellingAtLoss` | `netProceeds(currentPrice) < unitCost` — **the single definition**; replaces the legacy's two divergent `isCloseOut` forms |
| `canWinBuybox` | `floorPrice < buyboxPrice` and not in buybox |
| `marginPct` | `(netProceeds(P) − U) / U` |
| `headroomToFloor` | `P − floorPrice` |
| `competitorGap` | our effective price − the relevant competitor's effective price |

---

## 9. Open items

| # | Item | Owner |
|---|------|-------|
| Q-B | Confirm current cargo tariff bands for both marketplaces. Trendyol `getCargoInvoiceItems` gives real invoiced amounts. | product owner |
| Q-C | Confirm the marketing/service expenditure bands, if any still apply. | product owner |
| Q-E | Every cost source must supply VAT-inclusive unit costs (§0). Confirm the ERP export and the Excel stock import are on that basis before live writes. | product owner |

Closed 2026-11-03 by §0: Q-A (commission on the VAT-inclusive or net price — commission is
applied to the selling price as stated) and Q-D (Hepsiburada product VAT rate pre-sale — no
longer needed).
