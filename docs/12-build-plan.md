# 12 — Build Plan

An ordered, executable plan. Each phase has a definition of done that can be checked without
judgement. **Do not start a phase until the previous one's definition of done is met.**

Every phase assumes `CLAUDE.md` has been read and its hard rules apply throughout.

---

## Phase 0 — Safety (before any code)

| # | Task | Done when |
|---|------|-----------|
| 0.1 | Rotate every credential present in the legacy source (`MarketPlaces/*.cs`, `Database/SQLFunctions.cs`, `App.config`) | New credentials issued; old ones revoked at both marketplaces and the databases |
| 0.2 | Collect current commercial figures: commission rates, product VAT rates, commission VAT rate, cargo tariff bands, service/marketing expenditure bands | Values recorded in `docs/08-configuration-and-constants.md` with their source |
| 0.3 | *(deferred — see note)* Validate the cost model against a real settlement statement | For at least 10 real sales, predicted net proceeds matches the statement within 1 kuruş, or the discrepancy is explained |

> ### 📌 NOTE — settlement validation is DEFERRED, not cancelled
>
> The product owner cannot perform this comparison yet. **Development proceeds without it.**
>
> Consequences and how they are handled:
>
> - Build `packages/core` against the formulas and vectors in doc 02 as specified. They are
>   internally consistent and property-tested; validation confirms the *inputs* (commission
>   base, cargo bands, VAT treatment), not the algebra.
> - The open parameters (`commissionBase`, cargo bands, expenditure bands — doc 11 O-3, O-4)
>   are **configuration**, not code. Changing them later is a settings edit, not a rewrite.
>   Ship with best-known defaults and mark them provisional in the UI.
> - **This becomes a hard gate before Phase 8.4** (enabling live writes). Do not send a real
>   price to a real marketplace on an unvalidated cost model.
> - Until validated, run Phase 8.3 shadow mode and compare the engine's floor prices against
>   actual observed profitability wherever data exists.
>
> Why it still matters: doc 02 §6.1 shows the legacy floors were understated by 17–31% because
> product VAT was omitted entirely. The new model corrects this, but the *magnitude* of the
> correction depends on parameters only a settlement statement can confirm.

---

## Phase 1 — Skeleton

| # | Task | Done when |
|---|------|-----------|
| 1.1 | Monorepo scaffold: `packages/{core,shared,db,adapters,jobs}`, `apps/{web,worker}` | `npm install` and `npm run build` succeed at the root |
| 1.2 | `packages/shared`: `Money` (bigint kuruş), `Result<T,E>`, `Duration`, config Zod schemas, structured logger | Unit tests pass; `Money` arithmetic is exact and rounds half-up once |
| 1.3 | Lint, format, strict TypeScript, CI running tests on every package | CI green on an empty test suite |

**Definition of done:** `npm test` runs across all packages; `packages/core` has zero
dependencies on anything outside `packages/shared`.

---

## Phase 2 — Domain core

Specification: docs 01, 02, 03. This phase has **no I/O of any kind**.

| # | Task | Spec |
|---|------|------|
| 2.1 | `StockCode.parse()` → `{ baseCode, unitCount, isBundle }` or a typed error | 01 §2 |
| 2.2 | `CostCalculator.unitCost()` with bundle expansion, multipliers, cycle detection, `Result` errors | 02 §4 |
| 2.3 | `FeeModel`: effective commission rate, cargo band selection, expenditure band selection, VAT treatment flags | 02 §3 |
| 2.4 | `PriceCalculator.netProceeds()` | 02 §5.1 |
| 2.5 | `PriceCalculator.floorPrice()` with fixed-point band resolution | 02 §5.3 |
| 2.6 | `RepricingPolicy` type and validation | 03 §3 |
| 2.7 | `RepricingEngine.decide()` — gates, floor guard, phase machine, clamping, priorities | 03 §5, §6 |

**Definition of done:**

- Every test vector in doc 02 §7 passes.
- Every scenario T-1 … T-22 in doc 03 §11 passes.
- All four property tests in doc 03 §11 pass, plus the round-trip property in doc 02 §7.4.
- `packages/core` imports nothing but `packages/shared`.
- No `any`. No `Date.now()`. No `Math.random()`.

> This phase is the whole project's risk concentrated in one testable place. Do not move on
> with failing or skipped tests.

---

## Phase 3 — Persistence

Specification: doc 05, doc 10 §7.

| # | Task | Done when |
|---|------|-----------|
| 3.1 | Drizzle schema for all tables in doc 05 | Schema compiles for all three dialects |
| 3.2 | Migrations generated per dialect | `migrate` runs clean on empty SQLite, PostgreSQL and MySQL in CI |
| 3.3 | Repositories: stock, listings, campaigns, buybox observations, scrape runs, competitor observations, repricing state, submissions, budget, jobs, events, settings | Each has integration tests against **all three** engines |
| 3.4 | Dialect-aware upsert helper | Same input produces the same result on all three engines |
| 3.5 | Schema version check on boot | App refuses to start on mismatch and offers to migrate |
| 3.6 | `PruneHistory` retention logic | Retention windows from doc 05 §10 enforced and configurable |

**Definition of done:** the full repository test suite passes on SQLite, PostgreSQL and MySQL
in CI. Idempotency: running every migration twice is a no-op.

---

## Phase 4 — Adapters (read-only)

Specification: `docs/api-references.md`, doc 10 §3, §4.

**Before writing any adapter code, open the endpoint's official documentation link.**

| # | Task | Done when |
|---|------|-----------|
| 4.1 | `IMarketplaceAdapter` port + `MarketplaceCapabilities` + a shared contract test suite | Contract suite exists and fails for an unimplemented adapter |
| 4.2 | Rate limiter keyed by marketplace + API domain; retry with backoff; circuit breaker | Unit-tested with a fake clock |
| 4.3 | Trendyol adapter — auth, `fetchListings` (approved V2, incl. `commission`, `vatRate`, `priceSeenByCustomer`), `fetchBuyboxObservations` | Contract suite passes against recorded fixtures |
| 4.4 | Hepsiburada adapter — auth, per-domain hosts, `fetchListings`, `submitPriceChanges`/`pollSubmission` via **`price-uploads`** | Contract suite passes against recorded fixtures. ✅ **Done 2026-08-14** — see below. `fetchBuyboxObservations` alone still throws (§2.5, no declared response schema) |
| 4.5 | `IProductSource` port + `Manual`, `Excel` (configurable column mapping), `MarketplaceListing` | Each passes the source contract suite |
| 4.6 | `ErpDatabase` and `ErpApi` registered stubs | Appear in the UI as "yakında"; `fetch()` throws `NotImplemented`; config schemas defined |

**Definition of done:** no marketplace sentinel (`"< ? >"`, `-1`, `"Error"`, `"No Seller"`) and
no formatted composite string appears anywhere outside `packages/adapters`. Adapters are tested
only against fixtures, never live APIs.

> ### 4.4 — unblocked and implemented, 2026-08-14
>
> The vendor's OpenAPI 3.0.1 document for the listing integration was retrieved from the
> developer portal's public content API and is stored verbatim at
> `docs/vendor/hepsiburada-listing-openapi-v1.json`. api-references §2.2/§2.4/§2.6/§2.10 are
> written from it and §2.12 records how to re-fetch it.
>
> **Implemented:** `HepsiburadaAdapter` — `testConnection`, `fetchListings` (offset paging
> against `totalCount`, active-campaign-window pricing), `submitPriceChanges`/`pollSubmission`
> via `price-uploads`, all against fixtures shaped from the OpenAPI schema
> (`packages/adapters/src/hepsiburada/`). Passes the shared marketplace contract suite.
>
> Three findings that changed the design, all handled in code, not just documented — submit
> through `price-uploads` (3 fields), never `inventory-uploads` (18 mandatory fields that
> overwrite live configuration; `submitPriceChanges` refuses a list price for this reason); a
> `status: "Done"` response with a non-empty `priceValidations[]` is mapped to `status: 'failed'`
> with the marketplace's price band on `item.lock`, never audited as applied
> (`mapPriceUploadResult`); and `priceIncreaseDisabled` / `priceDecreaseDisabled` are carried on
> every `ListingSnapshot` for the decision engine to enforce.
>
> Because Hepsiburada enumerates only failures in its poll response, `pollSubmission` names the
> successes from the batch the adapter remembered at submission time (bounded, in-memory). If
> that memo is lost — a process restart between submit and confirm — only the named failures
> are reported and the rest stay unconfirmed until the job layer's timeout; a price that cannot
> be proven applied is never recorded as applied.
>
> **Still deferred:** `fetchBuyboxObservations` still throws `HepsiburadaBlockedError` and the
> commission lookup is not implemented. Both endpoints and their limits are confirmed, but the
> OpenAPI declares their 200 responses with **no schema**. One SIT session closes both — call
> each once and record the response as a fixture, exactly as §2.11 was done; writing a
> normaliser against the guide's prose field list is what CLAUDE.md's "never infer an
> endpoint's shape" forbids. Commission may also be where the pre-sale product VAT rate lives;
> it is confirmed absent from the listing schema, and a wrong VAT rate produces a wrong floor
> price (doc 02). The `HepsiburadaCredentials` schema's account question (§2.9: merchant login
> vs. integrator service key) also needs that session to resolve.
>
> `fetchListings` supplies the SKUs Phase 7's `HepsiburadaPublicListingsSource` keys on, so that
> competitor source is now live once real credentials are configured.

---

## Phase 5 — Jobs

Specification: doc 07.

| # | Task | Done when |
|---|------|-----------|
| 5.1 | DB-backed queue: claim, visibility timeout, retry, priority | Works on all three engines; concurrent claim test passes |
| 5.2 | Scheduler with single-instance lock and heartbeat | Two schedulers started → exactly one runs |
| 5.3 | `ImportStockItems`, `ImportBundles`, `ImportListings` with idempotent upsert + stale sweep gated on full success | Partial-failure test leaves no listing wrongly marked inactive |
| 5.4 | `ObserveBuybox` with tiering | Tier assignment is deterministic and recorded |
| 5.5 | `Reprice` — wires core to repositories, persists decisions and state | Shadow run over fixture data reproduces expected decisions |
| 5.6 | `SubmitPriceChanges` — outbox drain, batching, budget admission by priority | Budget test: exhausted budget admits priority 0 only |
| 5.7 | `ConfirmSubmissions` — poll to terminal state, classify rejections, consume budget on confirm | Confirmation-timeout path tested (Trendyol's 4-hour window) |
| 5.8 | `ResetBudget`, `PruneHistory` | Scheduled and tested |
| 5.9 | Graceful shutdown flushing pending batches | Kill test loses no queued submission |

**Definition of done:** a full pipeline run against fixture adapters produces correct
`price_submissions`, `repricing_state` and `job_runs` rows, and consumes budget only on
confirmation.

---

## Phase 6 — Web application

Specification: doc 06, doc 10 §1.1, §6.

| # | Task | Done when |
|---|------|-----------|
| 6.1 | Next.js app shell, Tailwind, Turkish locale formatting | Builds and runs |
| 6.2 | Setup wizard, all 8 steps with live connection tests | A fresh install can be configured end to end with no file editing |
| 6.3 | Single-process mode (`SINGLE_PROCESS=1`) | One command starts web + worker; the scheduler lock prevents duplication |
| 6.4 | Dashboard: kill switches, budget, phase distribution, alerts, marketplace health | Kill switch stops submissions within one poll interval |
| 6.5 | Stock screen + bundle editor | Manual and Excel sources usable from the UI |
| 6.6 | Listings grid: server paging, virtualisation, structural filters, bulk actions | 50,000-row catalogue scrolls and filters without loading everything |
| 6.7 | Listing detail: cost waterfall, competition panel, engine panel, decision history | Any current price is explainable without reading logs |
| 6.8 | Competitor history reporting | Charts render from `competitor_observations` + `scrape_runs` |
| 6.9 | Jobs and Events screens | Manual trigger and circuit-breaker reset work |
| 6.10 | Settings with audit and "preview impact" | A fee change previews affected listings before saving |

**Definition of done:** the operator can install, configure, import, observe and enable
repricing without touching a config file or the database.

---

## Phase 7 — Scraping (reporting only)

Specification: doc 07 §7, api-references §1.6 and §2.11,
[`trendyol-merchants-scraping-guide.md`](trendyol-merchants-scraping-guide.md).

~~Blocked until the product owner supplies the public Trendyol request shape.~~ **Supplied
2026-08-13** (the guide above). Hepsiburada's public listings endpoint was supplied and
**verified by direct request the same day** (§2.11) — it is a JSON API rather than a scrape, so
Hepsiburada has a competitor source too. Both are code-complete.

| # | Task | Trendyol | Hepsiburada |
|---|------|----------|-------------|
| 7.1 | `ScrapeCompetitors` job with rate limiting, caching, tiering | ✅ | n/a — the job is marketplace-agnostic |
| 7.2 | `scrape_runs` written on every run; `competitor_observations` only on change (hash comparison) | ✅ | n/a |
| 7.3 | Failure-rate alerting; per-failure silence | ✅ | n/a |
| 7.4 | Seller-identity invalidation trigger wired into the engine, skipped when data is absent | ✅ | n/a |
| 7.5 | A marketplace's `ICompetitorSource` implementation | ✅ `TrendyolPublicPageSource` | ✅ `HepsiburadaPublicListingsSource` |

✅ **Hepsiburada's competitor source is live as of 4.4 (2026-08-14).** `fetchListings` now
supplies `hepsiburadaSku` as `ProductPageRef.contentId` on every listing — the only key
§2.11's endpoint accepts — so `HepsiburadaPublicListingsSource` has something to fetch once
real merchant credentials are configured. Repricing is unaffected either way: this is a
reporting source, never the control path (CLAUDE.md).

**Definition of done:** disabling the scraper entirely leaves repricing fully functional.
✅ Asserted, not assumed — see `packages/jobs/src/pipeline/scrape-competitors.test.ts`, which
reprices to completion with no competitor source registered at all.

Additional decisions taken in this phase, beyond the tasks above:

- **`ScrapeCompetitors` ships disabled** and must be switched on by an operator, because
  api-references §1.6, §2.11 and doc 04 §1.5 require an explicit business decision before any
  of this runs. It is the only job in doc 07 §1 that defaults to off.
- **Browser impersonation for Hepsiburada only.** Its endpoint returns 403 to the honest user
  agent doc 04 §1.5's policy mandates; the ablation is recorded in §2.11 and the product owner
  authorised the exception on 2026-08-13. Trendyol continues to identify itself honestly.

---

## Phase 8 — Store onboarding and go-live

> ⚠️ **Revised 2026-08-14.** This phase originally assumed a data migration from an operating
> store's legacy MySQL database (doc 10 §11's "Migration plan", doc 05 §9's "Legacy migration
> mapping"). **That does not apply here.** This deployment is for a **new store with no
> existing catalogue, stock, prices or listings.** No row is backfilled from anywhere. The
> catalogue starts genuinely empty and is populated only going forward, through the product
> sources built in Phase 4.5 (Manual, Excel, `MarketplaceListing`).
>
> `reference/legacy-app/` and doc 05 §9 remain useful as **business-rule and schema-design
> reference only** (why a column exists, what defect it fixes) — never as a source of rows to
> import. This does not change CLAUDE.md's quarantine of that directory; if anything it
> narrows further what it's for.
>
> One consequence: **8.3's original form (diff against live legacy decisions) has no legacy
> system to diff against and is dropped.** 8.3b's original form (validate against a real
> settlement statement) also has no statement to validate against yet — a brand-new store has
> no sales history. It is replaced below with a same-intent, weaker-evidence check that a
> genuine one supersedes the moment real sales exist.

| # | Task | Done when |
|---|------|-----------|
| 8.1 | Register the store's marketplaces (Hepsiburada, Trendyol) and fee settings through the setup wizard | `testConnection` succeeds for each; `fee_settings` has a current row |
| 8.2 | Add the first products through a product source (Manual entry or Excel to start) | Listings grid shows them; `repriceEnabled` still `false` for all (doc 10 §6 step 8) |
| 8.3 | `ImportListings`/`ObserveBuybox` run against real marketplace listings with submissions still disabled | Prices, stock and buybox observations populate correctly; every listing starts phase `SEEKING` — there is no history to seed `OPTIMUM` from, and none should be invented |
| 8.3b | **GATE — cost model sanity check, no settlement statement available yet** | Commission, VAT and cargo figures cross-checked line-by-line against the marketplace's own published fee schedule and `docs/api-references.md` (§2.7 for Hepsiburada; Trendyol's public rate card), not a real settlement — **do not proceed to 8.4 without this**, and treat its confidence as provisional |
| 8.4 | Enable writes for Hepsiburada only, starting with a small, watched subset of listings | One to two weeks, tight kill switch, no price below floor, no budget exhaustion |
| 8.5 | The moment the first real settlement statement exists, validate the cost model against it and correct forward if it diverges | Confirms or corrects 8.3b's estimate — this is the real gate 8.3b stood in for |
| 8.6 | Enable writes for Trendyol | Same watch period as 8.4 |
| 8.7 | Widen to the full catalogue | Same guardrails hold at scale |

**Definition of done for 8.3b — do not skip this, even without settlement data.** A wrong
commission or VAT figure produces a wrong floor price and a real loss on the very first sale.
Cross-checking against the vendor's own documentation is weaker evidence than a settlement
statement, which is exactly why 8.5 exists as a mandatory follow-up the moment real data is
available, not an optional one.

---

## Phase 10 — Competitor intelligence and alerting

> Listed here, ahead of Phase 9, because this document is ordered by **execution**, not by
> number: Phase 9 is the never-scheduled parking lot and stays last.

Specification: doc 05 §5 and §10, doc 06 §6, doc 07 §1.1, doc 08.

`/competitors` already reports five things, but all of them are **listing-centric** — "who is on
this product". This phase adds the second axis, **seller-centric** — "which of our products is
this seller on, since when, how aggressively" — and a genuinely new capability, **alerting**.

Alerting is **reporting**. It writes an outcome and can never enter a pricing decision; Phase 7's
isolation rules apply unchanged.

Sized against a 2,000-active-listing target. Storage is bounded by the scrape budget, not by
catalogue size: `SCRAPE_MAX_LISTINGS_PER_RUN` caps fetches at 200/hour, so tiering spreads a
larger catalogue over longer intervals rather than writing proportionally more.

### 10A — Foundation

| # | Task | Status |
|---|------|--------|
| 10A.1 | Narrow the change-detection hash to `(rank, seller_ref, price, final_price)` | ✅ |
| 10A.2 | `competitor_sellers` + `competitor_seller_groups`, all three dialects; upsert from `ScrapeCompetitors` | ✅ |
| 10A.3 | `competitor_observations` retention: indefinite → 90 days, operator-configurable | ✅ |
| 10A.4 | doc 05, doc 07, api-references §1.6/§2.11 and this table | ✅ |

Definition of done: identity survives a seller renaming itself; an operator's cross-marketplace
link is never overwritten by a scrape; deleting a group unlinks members without deleting them;
a failure to record identities cannot fail a scrape.

### 10B — Seller-centric reports

| # | Task | Status |
|---|------|--------|
| 10B.1 | Aggregate seller reports in SQL (`GROUP BY`) instead of fetching rows and counting in JS; move the `baseStockCode` filter into the repository so it is applied **before** the 20,000-row cap, not after | ✅ |
| 10B.2 | `/competitors/sellers` and `/competitors/sellers/[marketplace]/[ref]`; cross-marketplace overlap CSV; group-linking UI | ✅ |
| 10B.3 | Coverage badges beside every metric; time-weighted buybox share with gaps excluded from the denominator; `≥` framing on first/last seen; "listed at", never "sold at" | ✅ |

Definition of done: a seller profile over any window returns a figure computed from the whole
window, not from the first 20,000 rows of it; every metric shows the coverage it rests on.

### 10C — Alerting

| # | Task | Status |
|---|------|--------|
| 10C.1 | `alert_rules`, `alerts`, `alert_sellers` — alerts modelled as **state** (open/resolved, first/last seen, evidence snapshot), not as an append-only log | ✅ |
| 10C.2 | Evaluation inside `ScrapeCompetitors` on the fresh snapshot, independent of whether observations were written; pure decision logic in `packages/core` | ✅ |
| 10C.3 | `/alerts`, dashboard card, per-marketplace staleness banner | ✅ |

Rule shape: scope (listing / stock code / marketplace / all) × subject (seller / seller group /
any) × predicate (`sellerPresent` | `priceBelow`) × threshold type (`fixed` | `belowOurPrice` |
`belowFloor` | `pctBelowOurs`). Thresholds are `bigint` kuruş — a fixed threshold is money too.

Dedup key follows the rule type: a specific-seller rule keys on `(rule, listing, seller)`; an
any-seller rule keys on `(rule, listing)` and carries the offending sellers as children, so a
market-wide breach is one dashboard row rather than twenty.

Definition of done: a rule created today fires on a product whose seller set has not changed in
days; **zero open alerts alongside a stale scrape reads as a warning, not as good news**; turning
the scraper off entirely leaves repricing untouched and the alert tables empty.

Deferred to when observed listings approach ~500: the daily rollup table and its nightly job
(doc 05 §10). Deferred indefinitely: SMS/e-mail/screenshot notification — the transition into
`open` is the hook, and Playwright is already in the stack for evidence capture.

---

## Phase 9 — MAY-ADD-LATER

Not in scope. Recorded so they are not forgotten.

| Item | Notes |
|------|-------|
| Order import and profit reporting | doc 05 §8; Trendyol webhooks preferred over polling |
| ERP database / API product sources | Stubs already registered (4.6) |
| Additional marketplaces | Add an adapter directory and a registry row |
| Learned optimum pricing | Once competitor history is deep enough, derive the optimum from data instead of probing for it — the data model already supports this |
| Farmazon | Dropped; re-add as an adapter if the business needs it |

---

## Definition of done for the whole project

- [ ] Cost model cross-checked against the marketplaces' published fee schedules (8.3b), then
      validated against a real settlement statement the moment one exists (8.5) — **deferred;
      blocks full-scale live writes, not the initial watched rollout**
- [ ] All doc 02 §7 vectors and doc 03 §11 scenarios pass
- [ ] Migrations and repositories green on SQLite, PostgreSQL and MySQL
- [ ] No credential in source, committed config, or a database column
- [ ] No marketplace sentinel or composite string outside `packages/adapters`
- [ ] Repricing survives total scraper failure
- [ ] Update budget never exceeded on any marketplace
- [ ] No price below floor observed for one week in production
- [ ] Every listing's current price is explainable from the UI
- [ ] A fresh install is configurable end to end through the wizard
- [ ] Global, per-marketplace and per-listing kill switches verified in production
