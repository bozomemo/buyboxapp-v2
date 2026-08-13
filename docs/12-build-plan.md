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
| 4.4 | Hepsiburada adapter — auth, per-domain hosts, `fetchListings`, buybox rank | Contract suite passes; 🔴 items in api-references §2.9 resolved first |
| 4.5 | `IProductSource` port + `Manual`, `Excel` (configurable column mapping), `MarketplaceListing` | Each passes the source contract suite |
| 4.6 | `ErpDatabase` and `ErpApi` registered stubs | Appear in the UI as "yakında"; `fetch()` throws `NotImplemented`; config schemas defined |

**Definition of done:** no marketplace sentinel (`"< ? >"`, `-1`, `"Error"`, `"No Seller"`) and
no formatted composite string appears anywhere outside `packages/adapters`. Adapters are tested
only against fixtures, never live APIs.

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

⚠️ **Hepsiburada collects nothing yet, and that is a Phase 4 gap, not a Phase 7 one.** The
endpoint is keyed by product SKU, and `HepsiburadaAdapter.fetchListings` is still blocked
(4.4, api-references §2.9), so no listing carries one. The source is registered and never
asked for anything. Repricing is unaffected on both marketplaces either way.

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

## Phase 8 — Migration and cutover

Specification: doc 10 §11, doc 05 §9.

| # | Task | Done when |
|---|------|-----------|
| 8.1 | Backfill script from the legacy MySQL database | Row counts reconcile; spot checks match |
| 8.2 | Seed `repricing_state` from the latest legacy price change per listing, phase `OPTIMUM` | The new engine does not re-probe the entire catalogue on first run |
| 8.3 | **Shadow mode** against live data, submissions disabled | Every divergence from legacy behaviour is explained as a legacy bug or a porting error |
| 8.3b | **GATE — settlement validation (deferred from 0.3)** | Cost model confirmed against a real settlement statement. **Do not proceed to 8.4 without this.** |
| 8.4 | Enable writes for Hepsiburada only | One week with no price below floor and no budget exhaustion |
| 8.5 | Enable writes for Trendyol | Same |
| 8.6 | Decommission the legacy app, stored functions and dead tables | Legacy app read-only, then retired |

**Definition of done for 8.3 — do not skip this.** The floor prices *will* diverge
substantially from the legacy system (doc 02 §6.1). That divergence is expected and is the
point. What must not exist is an *unexplained* divergence.

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

- [ ] Cost model validated against real settlement data (0.3 → gated at 8.3b) — **deferred; blocks live writes only**
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
