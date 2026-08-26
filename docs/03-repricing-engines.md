# 03 — Repricing Engine (target specification)

**One engine serves all marketplaces.** Differences between marketplaces are expressed as
policy, fee settings and declared capabilities — never as branches on a marketplace name.

Implementation home: `packages/core/repricing`. Pure function of its inputs. No I/O.

---

## 1. The idea in one paragraph

For each listing we are searching for the **highest price at which we still hold the buybox**.
We find it by climbing: while we hold the buybox, raise the price; the moment we lose it, we
know we have gone one step too far, so we come back down and refine. The price we settle on is
the optimum, and we hold it — issuing no further updates — until something in the world
changes that could move it. This holding behaviour is not an optimisation; marketplace update
quotas make it mandatory (§8).

---

## 2. Inputs

```ts
decide(input: DecisionInput): PriceDecision

interface DecisionInput {
  listing:      ListingSnapshot;    // our price, stock, commission, vatRate, status flags
  observation:  BuyboxObservation;  // rank, buybox/2nd/3rd price, observedAt
  state:        RepricingState;     // persisted phase + memory, see §4
  cost:         Result<Money, CostError>;
  fees:         FeeSettings;        // doc 02 §3
  policy:       RepricingPolicy;    // §3
  budget:       UpdateBudget;       // §8
  now:          Date;
}

interface BuyboxObservation {
  rank:              number | null;   // 1 = we hold the buybox; null = unknown
  buyboxPrice:       Money | null;
  secondPrice:       Money | null;
  thirdPrice:        Money | null;
  hasMultipleSeller: boolean;
  secondSellerId:    string | null;   // from the reporting scrape; may be stale or absent
  observedAt:        Date;
}

interface PriceDecision {
  action:      'none' | 'submit';
  newPrice?:   Money;
  nextState:   RepricingState;
  reason:      DecisionReason;
  priority:    number;          // 0 = highest, see §8
  explanation: string;          // human-readable, persisted and shown in the UI
}

type DecisionReason =
  | 'SellingAtLoss' | 'Seeking' | 'Climbing' | 'Refining' | 'HoldingOptimum'
  | 'Blocked' | 'SoleSeller' | 'NothingChanged' | 'AwaitingConfirmation'
  | 'AwaitingSettle' | 'Disabled' | 'InsufficientData' | 'BudgetExhausted'
  | 'CostUnknown' | 'PriceRangeRejected' | 'AtConfiguredLimit';
```

Every decision — including `none` — carries a reason and an explanation. The operator must
always be able to ask "why is this listing at this price?" and get an answer.

---

## 3. Policy

```ts
interface RepricingPolicy {
  enabled: boolean;

  // Climbing
  coarseStepMode:  'absolute' | 'percent';
  coarseStep:      bigint | number;   // e.g. 100n kuruş, or 1.5 (%)
  refineTolerance: bigint;            // stop refining below this gap, e.g. 10n kuruş

  // Seeking
  seekStrategy: 'direct' | 'stepped'; // default 'direct'
  undercutBy:   bigint;               // e.g. 1n kuruş below the buybox price
  seekStep:     bigint;               // only used when seekStrategy = 'stepped'

  // Sole seller
  soleSellerMarginPct: number;        // operator-defined; no hardcoded 1.2

  // Competitor low-stock guard
  lowStockGuardEnabled:   boolean;    // default false
  lowStockThreshold:      number;     // competitor stock below this counts as low
  lowStockMarginPct:      number;     // extra margin required to fight a low-stock holder

  // Stock policy
  stockMode:          'respectStock' | 'ignoreStock';  // operator choice
  minPhysicalStock:   number;         // used when stockMode = 'respectStock'

  // Settle
  requirePriceConfirmation: boolean;  // default true
  settleDuration:           Duration; // default 10 minutes after confirmation

  // Invalidation sensitivity
  competitorPriceDelta: bigint;       // ignore competitor moves smaller than this
  useSellerIdentityTrigger: boolean;  // needs scrape data; default true when available

  // Scheduling
  pollInterval: Duration;
  concurrency:  number;
}
```

Per-listing overrides, all optional: `minPrice`, `maxPrice`, `allowIncrease`, `allowDecrease`,
`enabled`. `minPrice`/`maxPrice` are hard bounds the engine may never cross — the single best
safeguard against a runaway bot, and the reason the unimplemented legacy columns of the same
name exist (doc 05 §2).

---

## 4. Persisted state

```ts
interface RepricingState {
  phase: 'SEEKING' | 'CLIMBING' | 'REFINING' | 'OPTIMUM' | 'BLOCKED';

  lastGoodPrice: Money | null;   // highest price at which we were observed in the buybox
  lastBadPrice:  Money | null;   // lowest price at which we were observed out of the buybox
  optimumPrice:  Money | null;   // the settled answer, set on entering OPTIMUM

  // Snapshot of the world when OPTIMUM was entered — the invalidation baseline
  optimumContext: {
    unitCost:       Money;
    commissionRate: number;
    vatRate:        number;
    campaignRatio:  number;
    secondPrice:    Money | null;
    secondSellerId: string | null;
  } | null;

  pendingSubmission: {
    submissionId:   string;
    submittedPrice: Money;
    submittedAt:    Date;
    confirmedAt:    Date | null;
  } | null;

  settleUntil: Date | null;
  consecutiveRejections: number;
}
```

---

## 5. Evaluation order

The engine evaluates gates in strict order. The first that matches returns immediately.

```
G1  policy.enabled == false, or listing.enabled == false          → Disabled
G2  listing is locked / suspended / not salable / archived        → Disabled
G3  cost is an error                                              → CostUnknown  (+ alert)
G4  stockMode == 'respectStock' and physicalStock < min           → Disabled
G5  pendingSubmission exists and confirmedAt == null              → AwaitingConfirmation
G6  requirePriceConfirmation and listing.price != submittedPrice  → AwaitingConfirmation
G7  now < settleUntil                                             → AwaitingSettle
G8  observation.rank == null (no buybox data)                     → InsufficientData
G9  observation.observedAt older than pollInterval × 2            → InsufficientData
```

Passing all gates, compute `floor = floorPrice(cost, …)` (doc 02 §5.2), then:

```
H1  floor is an error                                             → CostUnknown (+ alert)
H2  currentPrice < floor            and allowIncrease             → SUBMIT floor        [SellingAtLoss, priority 0]
H3  currentPrice < floor            and not allowIncrease         → none [SellingAtLoss, alert]
H4  clamp(floor) violates maxPrice                                → Blocked  (+ alert)
```

`H2` replaces the legacy "close-out" branch. It raises straight to the floor in one update
rather than creeping up by a fixed amount per cycle, and it takes priority over everything
else because every cycle spent below the floor is a real loss.

Then the phase machine (§6). Every price the machine produces passes through:

```
clamp(p):
    p = max(p, floor)
    p = max(p, listing.minPrice   ?? p)
    p = min(p, listing.maxPrice   ?? p)
    if p < floor: return AtConfiguredLimit      # maxPrice below floor — contradiction, alert
    return roundToKurus(p)
```

**No decrease may ever produce a price below `floor`.** This is the invariant the legacy
Hepsiburada engine lacked (doc 09 §4).

---

## 6. The phase machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
   price < floor ───┴──▶ [raise to floor] ──┐                  │
                                            │                  │
    ┌─────────┐  win buybox   ┌──────────┐  │  lose buybox  ┌──┴────────┐
    │ SEEKING │──────────────▶│ CLIMBING │──┼──────────────▶│ REFINING  │
    └─────────┘               └──────────┘  │               └───────────┘
         ▲                         ▲        │                     │
         │                         │        │        gap < tolerance
         │ lost buybox             │ can climb again              │
         │                         │                              ▼
         │                    ┌────┴──────────────────────┐  ┌─────────┐
         └────────────────────│         OPTIMUM           │◀─┘         │
                              └───────────────────────────┘            │
                                        ▲                              │
   floor ≥ buyboxPrice ┌─────────┐      │ buybox price rose above floor│
   ───────────────────▶│ BLOCKED │──────┘                              │
                       └─────────┘                                     │
```

### 6.1 SEEKING — we are not in the buybox

```
if buyboxPrice is null:
    if not hasMultipleSeller: → SOLE SELLER (§6.6)
    else: → InsufficientData

target = buyboxPrice − policy.undercutBy

if target < floor:
    → BLOCKED, reason 'Blocked'
    explanation: "Buybox is at X; our floor is Y. Cannot compete profitably."

if not allowDecrease and target < currentPrice: → none, reason 'Disabled'

if lowStockGuardEnabled and competitorStock < lowStockThreshold:
    guard = priceFor(netProceeds(target) × (1 + lowStockMarginPct/100))
    if guard > buyboxPrice: → none
        explanation: "Buybox holder is low on stock; not worth undercutting at this margin."

> `competitorStock` is the buybox holder's offered stock, and **neither official buybox API
> exposes it** (`capabilities.exposesCompetitorStock` is `false` on both adapters). Like
> `secondSellerId` in §6.5 it comes from the reporting scrape and degrades the same way: absent,
> stale or scraper-off leaves it `null` and the guard is simply not evaluated. It is never
> inferred, and `0` is never assumed for a marketplace that does not publish stock — that would
> read as "out of stock" and fire the guard on every listing there.

next = policy.seekStrategy == 'direct'
       ? clamp(target)
       : clamp(max(currentPrice − seekStep, target))

if next == currentPrice: → none, reason 'NothingChanged'
→ SUBMIT next, reason 'Seeking', priority 1
   state: phase stays SEEKING, lastBadPrice = min(lastBadPrice ?? ∞, currentPrice)
```

> **`seekStrategy: 'direct'` is the default and the recommendation.** Stepping down gradually
> costs one quota-consuming update per step and leaves us outside the buybox — losing sales —
> for every cycle of the descent. A single jump to just under the buybox price reaches the
> same place in one update. The stepped mode exists only if the operator wants a gentler
> market presence.

### 6.2 CLIMBING — we hold the buybox, probe upward

```
lastGoodPrice = max(lastGoodPrice ?? 0, currentPrice)     # we hold the buybox here

if not allowIncrease: → OPTIMUM at currentPrice, reason 'HoldingOptimum'

step = coarseStepMode == 'percent' ? currentPrice × coarseStep/100 : coarseStep
next = clamp(currentPrice + step)

if lastBadPrice is not null and next >= lastBadPrice:
    → REFINING            # we already know that price loses; binary search instead

if next == currentPrice: → OPTIMUM at currentPrice     # clamped by maxPrice
    reason 'AtConfiguredLimit'

→ SUBMIT next, reason 'Climbing', priority 3
   state: phase stays CLIMBING, lastGoodPrice as above
```

### 6.3 CLIMBING → REFINING — we just lost the buybox

Triggered when `phase == CLIMBING` and `rank != 1`.

```
lastBadPrice = min(lastBadPrice ?? ∞, currentPrice)
→ REFINING
```

Note we do **not** immediately revert. The revert happens as the natural conclusion of
refining, which lands on `lastGoodPrice` if no better price is found.

### 6.4 REFINING — binary search for the exact ceiling

```
if lastGoodPrice is null:          # lost the buybox before ever holding it
    → SEEKING

gap = lastBadPrice − lastGoodPrice
if gap <= policy.refineTolerance:
    → OPTIMUM at lastGoodPrice
      state: optimumPrice = lastGoodPrice, optimumContext = snapshot(now)
      if currentPrice != lastGoodPrice: SUBMIT lastGoodPrice, reason 'Refining', priority 2
      else: none, reason 'HoldingOptimum'

mid = clamp(lastGoodPrice + gap / 2)
if mid == currentPrice or mid <= lastGoodPrice or mid >= lastBadPrice:
    → OPTIMUM at lastGoodPrice          # cannot subdivide further
→ SUBMIT mid, reason 'Refining', priority 2
```

On the next evaluation, the observed rank updates the bracket:

```
rank == 1  → lastGoodPrice = currentPrice
rank != 1  → lastBadPrice  = currentPrice
```

Convergence is `log₂(initialGap / refineTolerance)` updates. With a 100 kuruş coarse step and
a 10 kuruş tolerance, refinement costs at most 4 updates — versus the legacy's unbounded
per-cycle creep.

### 6.5 OPTIMUM — hold, and watch for invalidation

**Issues no updates.** This is where a healthy listing spends almost all of its life.

```
ctx = state.optimumContext

invalidated =
     costChanged            (|unitCost − ctx.unitCost| > 0)
  or commissionChanged      (commissionRate != ctx.commissionRate)
  or vatChanged             (vatRate != ctx.vatRate)
  or campaignChanged        (campaignRatio != ctx.campaignRatio)
  or secondPriceChanged     (|secondPrice − ctx.secondPrice| > policy.competitorPriceDelta)
  or secondSellerChanged    (policy.useSellerIdentityTrigger
                             and secondSellerId is known
                             and secondSellerId != ctx.secondSellerId)
  or lostBuybox             (rank != 1)

if not invalidated: → none, reason 'HoldingOptimum'

if lostBuybox:
    lastBadPrice = currentPrice
    lastGoodPrice = null           # the old bracket is stale; the market moved
    → SEEKING
else:
    lastBadPrice = null            # the ceiling may have moved up; re-probe
    → CLIMBING
```

This is exactly the behaviour described by the operator: find the highest price that still
wins the buybox, hold it, and only re-optimise when our cost, the runner-up's price, the
runner-up's identity, or our buybox position changes.

> **Seller identity trigger degrades gracefully.** `secondSellerId` comes from the reporting
> scrape (doc api-references §1.6), which may be stale or unavailable. When it is unknown, the
> trigger is simply not evaluated — price-based triggers still fire. The scrape must never
> gate a decision.

### 6.6 SOLE SELLER — no competitor

```
targetNet = unitCost × (1 + policy.soleSellerMarginPct/100)
next      = clamp(priceFor(targetNet))
if next == currentPrice: → none, reason 'HoldingOptimum'
→ SUBMIT next, reason 'SoleSeller', priority 4
```

`soleSellerMarginPct` is operator-configured. The legacy hardcoded `1.2`.

### 6.7 BLOCKED — cannot compete profitably

```
if buyboxPrice is null: → none, reason 'InsufficientData'

if buyboxPrice > floor + policy.undercutBy:
    → SEEKING                        # the market came back to us

if currentPrice != floor and allowIncrease:
    → SUBMIT floor, reason 'Blocked', priority 1
      explanation: "Holding at floor; buybox at X is below our break-even of Y."
→ none, reason 'Blocked'
```

---

## 7. Submission, confirmation and settling

A decision does **not** immediately change `lastGoodPrice` / `lastBadPrice`. Those only move
in response to an *observation* taken after the price is confirmed and settled. This is what
prevents the engine from recording a bracket based on stale competitor data.

```
1. decide() returns action = 'submit', newPrice = P
2. Worker enqueues P into the marketplace outbox
3. Outbox batches and submits            → state.pendingSubmission = { id, P, submittedAt }
4. Confirmation job polls the marketplace batch/upload status
     success → pendingSubmission.confirmedAt = now
                settleUntil = now + policy.settleDuration
                write the price-change audit record          ← only now
     failure → clear pendingSubmission
                consecutiveRejections++
                classify the error (§7.1)
5. Next observation after settleUntil, with listing.price == P, is the first that may
   update the bracket
```

Gates G5–G7 enforce this. `requirePriceConfirmation` may be disabled for marketplaces whose
listing feed is slow to reflect changes, falling back to `settleDuration` alone.

### 7.1 Rejection handling

| Class | Examples | Engine response |
|-------|----------|-----------------|
| Transient | 429, 5xx, timeout | Retry with backoff; state unchanged |
| Business — price range | Hepsiburada `OutOfPriceRange` | **Permanent.** Record the rejected price as an effective bound (a rejected *increase* sets `maxPrice`, a rejected *decrease* sets `minPrice`), alert the operator, do not retry |
| Business — campaign | `DiscountedListingPriceIncrease`, `DiscountedListingStockDecrease` | Permanent while the campaign runs. Move to OPTIMUM at the current price; re-evaluate when the campaign ends |
| Quota | "too many ongoing uploads", "exceeds inventory upload limit" | Back off; stop submitting for the marketplace until the window resets |
| Validation | malformed payload | Bug. Alert loudly; do not retry |

`consecutiveRejections` above a threshold disables automation for the listing and raises an
alert — a listing must never be retried forever.

---

## 8. Update budget — a first-class constraint

Marketplaces cap how many listing updates we may make:

| Marketplace | Cap |
|-------------|-----|
| Hepsiburada | **10 × listing count per day**, ≤ 4,000 per batch, ≤ 5 concurrent batches |
| Trendyol | Inventory & price write quota 350–2,000 req/min by tier; ≤ 1,000 items per request; identical request not repeatable within 15 minutes |

```ts
interface UpdateBudget {
  dailyAllowance:  number;
  consumedToday:   number;
  reservePct:      number;   // default 20 — held back for SellingAtLoss and Seeking
  remaining():     number;
}
```

The worker filters decisions by priority when the budget runs low:

| Priority | Reason | Admitted while remaining budget is… |
|----------|--------|-------------------------------------|
| 0 | `SellingAtLoss` | always — losing money every cycle |
| 1 | `Seeking`, `Blocked` (raise to floor) | above 0 |
| 2 | `Refining` | above the reserve |
| 3 | `Climbing` | above the reserve, and only for listings ranked by expected value |
| 4 | `SoleSeller` | above the reserve |

When the budget is exhausted the decision is returned with reason `BudgetExhausted` and the
listing is re-queued for the next window. The operator sees remaining budget in the UI.

**This is why OPTIMUM matters.** A converged catalogue consumes almost no budget: only
listings whose world actually changed produce updates. The legacy system, whose idempotency
gate was defeated (doc 09 §3), would have burned the entire Hepsiburada daily allowance
continuously.

---

## 9. Marketplace capability differences

The engine does not branch on marketplace. It reads capabilities:

```ts
interface MarketplaceCapabilities {
  maxBatchSize:            number;
  competitorPriceDepth:    number;   // Trendyol 3 (buybox/2nd/3rd), Hepsiburada TBC
  exposesCompetitorIdentity: boolean;// Trendyol false (API), Hepsiburada likely true
  exposesCompetitorStock:  boolean;  // Trendyol only via scrape
  exposesCampaignPrice:    boolean;  // both true
  supportsConfirmation:    boolean;  // both true
  dailyUpdateAllowance:    (listingCount: number) => number;
}
```

Where a capability is absent, the corresponding trigger or guard is skipped, not faked.

---

## 10. What changed from the legacy engine

| Legacy | Target | Why |
|--------|--------|-----|
| Two divergent engines | One engine + policy | Guards existed in one and not the other (doc 09 §4) |
| Ratchets price every cycle | Holds at OPTIMUM | Idempotency gate was defeated (doc 09 §3); quota makes holding mandatory |
| Fixed step ladder / fixed 0.20 | Coarse climb + binary refine | Converges in `log₂` steps instead of linearly |
| Steps down gradually to reach the buybox | Jumps directly under it | One update instead of N; less time out of the buybox |
| Hepsiburada decreases unchecked | `clamp()` enforces floor everywhere | doc 09 §4 |
| Audit written before submission | Written after confirmation | doc 09 §5 |
| No settle period | Confirmation + settle gates | Prevents recording a bracket from stale data |
| Scrape on the critical path | Official buybox API drives control | Scrape failure no longer stops repricing |
| Sentinel `999` / `-1` costs | `Result<Money, CostError>` | doc 09 §7 |
| No per-listing bounds | `minPrice` / `maxPrice` enforced | Runaway protection |
| No budget awareness | Priority-based budget admission | Quota is a hard marketplace limit |

---

## 11. Test scenarios

Table-driven; each is a sequence of (observation → expected decision → next state).

| # | Scenario | Expectation |
|---|----------|-------------|
| T-1 | Price below floor | Single submit to exactly `floor`, priority 0 |
| T-2 | Below floor, `allowIncrease = false` | No submit, alert raised |
| T-3 | Rank 3, buybox above floor, direct seek | One submit to `buyboxPrice − undercutBy` |
| T-4 | Rank 3, buybox below floor | → BLOCKED, submit floor, no undercut |
| T-5 | Rank 1, climbing | Submit `current + coarseStep`, `lastGoodPrice = current` |
| T-6 | Climbing, then rank 2 | → REFINING, `lastBadPrice` set, **no submit that cycle** |
| T-7 | Refining, gap 100 kuruş, tolerance 10 | Converges in ≤ 4 submits, ends at the highest winning price |
| T-8 | OPTIMUM, nothing changed | No submit, reason `HoldingOptimum`, for 100 consecutive cycles |
| T-9 | OPTIMUM, 2nd price rises | → CLIMBING, `lastBadPrice` cleared |
| T-10 | OPTIMUM, we lose the buybox | → SEEKING, `lastGoodPrice` cleared |
| T-11 | OPTIMUM, unit cost rises above optimum's floor | Floor gate fires first: submit new floor |
| T-12 | Submitted, not yet confirmed | `AwaitingConfirmation`, no submit |
| T-13 | Confirmed, inside settle window | `AwaitingSettle`, no submit |
| T-14 | Confirmed, observed price still old | `AwaitingConfirmation`, bracket untouched |
| T-15 | `OutOfPriceRange` on an increase | `maxPrice` set to just below the rejected price, alert, no retry |
| T-16 | Budget exhausted, climbing decision | `BudgetExhausted`, no submit |
| T-17 | Budget exhausted, selling at loss | Submits anyway (priority 0) |
| T-18 | Sole seller | Price pinned to `cost × (1 + soleSellerMarginPct)` |
| T-19 | Competitor low on stock, guard on | No undercut when the guard margin exceeds the buybox price |
| T-20 | Cost unknown | No submit, `CostUnknown`, alert |
| T-21 | `maxPrice` below floor | `AtConfiguredLimit`, alert, no submit |
| T-22 | Scrape unavailable (`secondSellerId` null) | Identity trigger skipped; price triggers still fire |

Property tests:

- The engine never submits a price below `floor` on any path except when raising *to* it.
- The engine never submits a price outside `[minPrice, maxPrice]`.
- From any state, a sequence of unchanged observations converges to zero submissions within a
  bounded number of cycles.
- `lastGoodPrice < lastBadPrice` holds whenever both are set.
