# 02 — Cost & Price Model (target specification)

This is the mathematical core. Everything in doc 03 sits on top of it. This document
specifies what the **new** system must implement. Where the legacy system differs, the
difference is called out — the legacy behaviour is a bug unless explicitly stated otherwise.

Implementation home: `packages/core`. Pure functions, no I/O, fully unit-tested against the
vectors in §7.

---

## 1. Money representation

**All monetary values are `bigint` in minor units (kuruş).** Never `number`, never `float`,
in any layer.

- Parse at the adapter boundary: `149.90` → `14990n`.
- Format at the display boundary only.
- Rates and multipliers (commission %, VAT %, ratios) are `number`, since they are not money.
- Rounding: **half-up to the nearest kuruş**, applied once, at the end of a calculation chain.
  Never round intermediate values.

> The legacy system uses `double` in C# and `double` in MySQL for every price and cost. This
> is a defect, not a style choice.

---

## 2. Inputs and where they come from

| Input | Symbol | Source | Notes |
|-------|--------|--------|-------|
| Unit cost | `U` | ERP / stock item | **VAT-exclusive** |
| Selling price | `P` | Marketplace listing | **VAT-inclusive** (what the customer is quoted) |
| Product VAT rate | `v` | Marketplace listing API (`vatRate`) | 1, 10 or 20 (%) |
| Commission rate | `c₀` | Marketplace listing API (`commission` / `commissionRate`) | **Ex-VAT** percentage |
| Commission VAT rate | `vc` | Config, default **20** | |
| Cargo bands | `K(·)` | Config | |
| Expenditure bands | `E(·)` | Config | |
| Campaign final price | `Pf` | Marketplace (`priceSeenByCustomer` / `finalPrice`) | What the customer actually pays |
| Store share of campaign | `s` | Marketplace (HB `debtors`) | % of the discount we fund |

---

## 3. Fee settings (per marketplace, effective-dated)

```ts
interface FeeSettings {
  effectiveFrom: Date;

  // Commission
  commissionVatRate: number;            // default 20
  commissionRateIncludesVat: boolean;   // default false — APIs return ex-VAT
  commissionVatDeductible: boolean;     // default false — VAT is a real cost
  commissionBase: 'gross' | 'net';      // default 'gross' — charged on the VAT-inclusive price
  defaultCommissionRate: number;        // fallback when the API omits it

  // Cargo — bands are ordered, first match wins
  cargoBands: { maxPrice: bigint | null; amount: bigint }[];
  cargoAmountsIncludeVat: boolean;      // default true — operator enters what they pay
  cargoVatRate: number;                 // default 20
  cargoVatDeductible: boolean;          // default false

  // Other expenditure (marketing / service fees)
  expenditureBands: { minPrice: bigint; amount: bigint }[];
  expenditureIncludesVat: boolean;      // default true
  expenditureVatRate: number;           // default 20
  expenditureVatDeductible: boolean;    // default false
}
```

**Defaults treat commission, cargo and expenditure as VAT-inclusive costs** — i.e. the VAT on
these invoices is a real expense, not reclaimed. This matches the legacy assumption and the
operator's instruction. Flipping any `*VatDeductible` to `true` models reclaiming that input
VAT and lowers the floor price accordingly.

### 3.1 Effective commission rate

```
grossRate = commissionRateIncludesVat ? c₀ : c₀ × (1 + vc/100)

c_eff = commissionVatDeductible ? c₀ : grossRate
```

With the defaults and `c₀ = 16`, `vc = 20`: `c_eff = 19.2%`.

### 3.2 Effective cargo and expenditure amounts

```
normalise(amount, includesVat, vatRate, deductible):
    withVat = includesVat ? amount : amount × (1 + vatRate/100)
    return deductible ? withVat / (1 + vatRate/100) : withVat
```

With the defaults, the configured amount is used as entered.

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
netProceeds(P, v, c_eff, campaign, fees):

    # 1. Campaign: what the customer pays, and who funds the discount
    Pf                = campaign ? campaign.finalPrice : P
    totalDiscount     = P - Pf
    storeDiscount     = totalDiscount × (campaign ? campaign.storeSharePct/100 : 0)
    marketplaceRefund = totalDiscount - storeDiscount

    # 2. Commission base
    commissionBase = fees.commissionBase == 'gross' ? (P - storeDiscount)
                                                    : (P - storeDiscount) / (1 + v/100)
    commission     = commissionBase × c_eff/100

    # 3. Fixed costs, chosen from the price the customer sees
    cargo       = normalisedCargo(Pf, fees)
    expenditure = normalisedExpenditure(Pf, fees)

    # 4. Revenue is net of product VAT — the VAT portion is remitted to the state
    revenueNet = Pf / (1 + v/100)

    return revenueNet - commission - cargo - expenditure + marketplaceRefund
```

With no campaign (`Pf = P`, `storeDiscount = 0`, `marketplaceRefund = 0`) this reduces to:

```
netProceeds = P/(1 + v/100) - P × c_eff/100 - cargo - expenditure
```

### 5.2 Floor price — `floorPrice(U)`

*What must I charge so that net proceeds exactly equal my cost?*

Solve `netProceeds(P) = U` for `P`. With no campaign:

```
P × [ 1/(1 + v/100) - c_eff/100 ] = U + cargo + expenditure

floorPrice = (U + cargo + expenditure) / [ 1/(1 + v/100) - c_eff/100 ]
```

Let `D = 1/(1 + v/100) - c_eff/100` — the **net retention factor**.

With a campaign, the price we set is `P` but the customer pays `Pf = P × r` where
`r = campaignRatio`. Substituting and solving:

```
D_campaign = r/(1 + v/100) - (1 - (1-r) × s/100) × c_eff/100 + (1-r) × (1 - s/100)

floorPrice = (U + cargo + expenditure) / D_campaign
```

### 5.3 The band circularity, and how to resolve it

Cargo and expenditure depend on the price, but the price is what we are solving for. Resolve
by **iterating to a fixed point** rather than the legacy's hand-unrolled band descent:

```
floorPrice(U, v, c_eff, campaign, fees):
    D = retentionFactor(v, c_eff, campaign, fees)
    if D <= 0: return PriceError.NotProfitableAtAnyPrice

    P = (U + fees.cargoBands.last.amount + fees.expenditureBands.last.amount) / D   # upper seed
    for i in 0..MAX_ITERATIONS (5):
        cargo       = normalisedCargo(customerPrice(P, campaign), fees)
        expenditure = normalisedExpenditure(customerPrice(P, campaign), fees)
        next        = (U + cargo + expenditure) / D
        if bandsOf(next) == bandsOf(P): return roundUpToKurus(next)
        P = next
    return roundUpToKurus(P)     # did not settle; return the last, conservative value
```

Seeding from the **highest** band and converging downward guarantees the result is never
below the true floor, which is the safe direction. If the iteration oscillates between two
adjacent bands (possible exactly at a band edge), take the **higher** price.

`D <= 0` means no price is profitable — commission plus VAT exceeds 100% of revenue. Return an
error; do not produce a price.

> **This replaces the legacy `calcMinPrice` band descent entirely.** The legacy version tests
> the cost against `(threshold − 0.01) × m − nextBandCargo`, an approximation that is wrong at
> band edges and impossible to reason about. See doc 09.

---

## 6. What changed from the legacy model, and why it matters

### 6.1 Product VAT was missing entirely — floors were systematically too low

The legacy floor is `(U + cargo) / (1 − c/100)`. It contains **no product VAT term**, while
cost is VAT-exclusive and price is VAT-inclusive. The two are not on the same basis.

| | Retention factor `D` | Floor at `U = 2000` kuruş |
|---|---|---|
| Legacy (`c = 16`) | `1 − 0.16 = 0.840` | **2948 kuruş** |
| Correct (`v = 10`, `c₀ = 16`, `vc = 20`) | `1/1.10 − 0.192 = 0.7171` | **3454 kuruş** |
| Correct (`v = 20`, `c₀ = 16`, `vc = 20`) | `1/1.20 − 0.192 = 0.6413` | **3861 kuruş** |

The legacy floor understates the true break-even by **17%** at 10% VAT and **31%** at 20% VAT.
Every "profitable" decision the legacy bot made near its floor was in fact a loss.

> 📌 **Settlement validation is deferred.** The product owner cannot yet compare against a real
> statement. Build to this model as specified — the algebra is property-tested and internally
> consistent. What validation confirms is the **input parameters** (`commissionBase`, cargo
> bands, expenditure bands), and those are configuration, not code. Ship provisional defaults,
> mark them as provisional in the UI, and treat validation as a **hard gate before enabling
> live writes** (doc 12 Phase 8.3b). Sources when it happens: Trendyol `getSettlements` and
> `getCargoInvoiceItems`; Hepsiburada order `commission.amount` / `vat` / `vatRate`.

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

These are the acceptance tests for `packages/core`. Values in kuruş.

### 7.1 Retention factor

| `v` | `c₀` | `vc` | deductible | `c_eff` | `D` |
|-----|------|------|-----------|---------|-----|
| 10 | 16.00 | 20 | false | 19.200 | 0.717071 |
| 20 | 16.00 | 20 | false | 19.200 | 0.641333 |
| 1  | 16.00 | 20 | false | 19.200 | 0.798218 |
| 10 | 16.00 | 20 | **true** | 16.000 | 0.749091 |
| 10 | 7.83  | 20 | false | 9.396  | 0.815095 |
| 20 | 45.00 | 20 | false | 54.000 | 0.293333 |
| 20 | 70.00 | 20 | false | 84.000 | **≤ 0 → error** |

### 7.2 Floor price — no campaign

Fees: cargo bands `[{maxPrice: 3000, amount: 476}, {maxPrice: 7500, amount: 900}, {maxPrice: null, amount: 1100}]`,
no expenditure, all VAT-inclusive, commission ex-VAT with `vc = 20`.

| `U` | `v` | `c₀` | Expected floor | Selected cargo band |
|-----|-----|------|----------------|---------------------|
| 2000 | 10 | 16 | 3454 | 900 (settles: 3454 > 3000) |
| 2000 | 20 | 16 | 3900 | 900 |
| 1000 | 10 | 16 | 2059 | 476 |
| 5000 | 20 | 16 | 9510 | 1100 |
| 500  | 1  | 7.83 | 1223 | 476 |

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

This is the single most valuable invariant. Property-test it across all VAT rates, commission
rates, campaign ratios and cargo bands.

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
| Q-A | Confirm `commissionBase` per marketplace: is commission charged on the VAT-inclusive price or the net price? Default assumed `gross`. | verify against a settlement statement |
| Q-B | Confirm current cargo tariff bands for both marketplaces. Trendyol `getCargoInvoiceItems` gives real invoiced amounts. | product owner |
| Q-C | Confirm the marketing/service expenditure bands, if any still apply. | product owner |
| Q-D | Confirm whether Hepsiburada exposes product VAT rate pre-sale (doc api-references §2.7). If not, VAT must be configured per category. | product owner |
