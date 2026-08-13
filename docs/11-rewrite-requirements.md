# 11 — Requirements & Acceptance Criteria

Numbered and testable. Each links to the document that specifies the behaviour.
Priority: **M** must-have · **S** should-have · **C** could-have.

Settled product decisions are recorded in doc 10 §0 and are not re-litigated here.

---

## 1. Domain & pricing

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-1 | M | Parse seller stock codes in exactly one place into `{ baseCode, unitCount, isBundle }`; reject unparseable codes rather than defaulting | 01 §2 |
| F-2 | M | Unit cost = base cost × pack size × per-marketplace multiplier | 02 §4 |
| F-3 | M | Bundles expand to members with explicit quantity; no member cap; cost = Σ, stock = min; cycle detection | 01 §6, 05 §3 |
| F-4 | M | An unresolvable cost excludes the listing from automation and alerts — never a sentinel price | 02 §4, 09 §7 |
| F-5 | M | `netProceeds(P)` accounts for product VAT, commission (with VAT treatment), tiered cargo, tiered expenditure, and campaign cost-sharing | 02 §5.1 |
| F-6 | M | `floorPrice(U)` is the inverse of F-5, resolved by fixed-point band iteration, erroring when no price is profitable | 02 §5.2–5.3 |
| F-7 | M | Cargo and expenditure bands are data; commission VAT rate, VAT-inclusion and deductibility are configurable per marketplace | 02 §3 |
| F-8 | M | Defaults treat commission, cargo and expenditure as VAT-inclusive costs | 02 §3 |
| F-9 | M | Fee settings are effective-dated | 02 §3, 05 §2 |
| F-10 | M | All money is `bigint` minor units; rounding half-up, applied once | 02 §1 |
| F-11 | M | Product VAT rate and commission rate are read from the marketplace listing API | api-references §1.4, §2.7 |

## 2. Repricing engine

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-12 | M | One engine for all marketplaces, parameterised by policy, fees and capabilities | 03, 10 §3 |
| F-13 | M | Phases `SEEKING`, `CLIMBING`, `REFINING`, `OPTIMUM`, `BLOCKED` with the specified transitions | 03 §6 |
| F-14 | M | Price below floor raises to the floor in one submission, at highest priority | 03 §5 (H2) |
| F-15 | M | `CLIMBING` records `lastGoodPrice` and probes upward; losing the buybox enters `REFINING` | 03 §6.2–6.3 |
| F-16 | M | `REFINING` binary-searches between `lastGoodPrice` and `lastBadPrice` to `refineTolerance` | 03 §6.4 |
| F-17 | M | `OPTIMUM` issues **no** updates until an invalidation trigger fires | 03 §6.5 |
| F-18 | M | Invalidation triggers: unit cost, commission, VAT, campaign ratio, runner-up price, runner-up identity, buybox loss | 03 §6.5 |
| F-19 | M | Seller-identity trigger degrades gracefully when scrape data is absent | 03 §6.5 |
| F-20 | M | `SEEKING` jumps directly below the buybox price by default; stepped mode configurable | 03 §6.1 |
| F-21 | M | No decrease may produce a price below the floor, on any marketplace, on any path | 03 §5 |
| F-22 | M | Per-listing `minPrice`/`maxPrice` are enforced; a `maxPrice` below the floor alerts | 03 §5 |
| F-23 | M | Sole-seller target uses an operator-configured margin, not a constant | 03 §6.6 |
| F-24 | M | Stock mode `respectStock` / `ignoreStock` is an operator setting | 03 §3 |
| F-25 | S | Competitor low-stock guard, off by default, applied uniformly at all ranks | 03 §6.1 |
| F-26 | M | Every decision carries a machine-readable reason and a human-readable explanation, both persisted | 03 §2 |
| F-27 | M | Shadow mode computes and records decisions without submitting | 07 §10 |

## 3. Submission, confirmation, budget

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-28 | M | Submissions go through an outbox; batched to the marketplace maximum | 07 §2 |
| F-29 | M | Every submission is polled to a terminal state | 03 §7, api-references |
| F-30 | M | Audit reaches `confirmed` only after marketplace confirmation | 03 §7 |
| F-31 | M | Bracket state (`lastGood`/`lastBad`) updates only from an observation taken after confirmation **and** the settle window | 03 §5, §7 |
| F-32 | M | Rejections are classified; business rejections are not retried and update the listing's effective bounds | 03 §7.1 |
| F-33 | M | Daily update budget tracked per marketplace, consumed on confirmation, enforced by decision priority with a reserve | 03 §8, 07 §5 |
| F-34 | M | Trendyol's 4-hour batch-result retention is respected; unconfirmed submissions are reconciled from the listing's actual price | 07 §11 |
| F-35 | M | Consecutive rejections above a threshold disable the listing and alert | 03 §7.1 |

## 4. Integrations

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-36 | M | One adapter port; marketplace specifics never leak into the domain | 10 §3 |
| F-37 | M | No marketplace sentinel or composite string escapes an adapter | 10 §3, 09 §12 |
| F-38 | M | Official buybox APIs drive the control loop; scraping is reporting-only | 10 §5.1 |
| F-39 | M | Repricing continues fully when scraping is unavailable | 07 §7 |
| F-40 | M | Rate limiting keyed per marketplace **and** API domain; retry with backoff; circuit breaker | 07 §3 |
| F-41 | M | Hepsiburada `X-RateLimit-*` response headers are honoured over static limits | 07 §3 |
| F-42 | M | Imports are idempotent upserts with a stale sweep gated on full success | 07 §6 |
| F-43 | M | Wire serialisation is culture-invariant; payloads produced by a serialiser, never concatenation | 09 §21 |
| F-44 | M | Endpoints verified against official docs before implementation; `docs/api-references.md` updated with the verification date | CLAUDE.md |
| F-45 | M | Adapters tested against recorded fixtures, never live APIs | 10 §10 |
| F-46 | S | Trendyol webhooks evaluated before building order polling | api-references §1.4 |

## 5. Product ingestion

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-47 | M | `IProductSource` port with a registry; sources declare a config schema that drives the UI | 10 §4 |
| F-48 | M | `Manual`, `Excel` (configurable column mapping), `MarketplaceListing` implemented | 10 §4 |
| F-49 | M | `ErpDatabase` and `ErpApi` registered as stubs, shown disabled, ready to implement | 10 §4 |
| F-50 | M | Ingestion never overwrites operator-owned fields | 01 §3, 07 §6 |
| F-51 | M | Import previews rows before committing | 06 §3 |

## 6. Data & persistence

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-52 | M | Code-first schema with migrations working on SQLite, PostgreSQL and MySQL | 05 §1, 10 §7 |
| F-53 | M | Migrations are forward-only and idempotent; the app verifies schema version on boot | 05 §1 |
| F-54 | M | Real foreign keys, consistent naming, one boolean representation | 05 §1 |
| F-55 | M | No business logic in the database — no pricing functions, no computed views | 10 §12 |
| F-56 | M | No presentation formatting in the database | 09 §29 |
| F-57 | M | Competitor data stored as typed rows, never JSON blobs or composite strings | 05 §5 |
| F-58 | M | `scrape_runs` written on every scrape; `competitor_observations` only on change | 05 §5, 10 §5 |
| F-59 | M | Competitor and scrape history retained indefinitely | 05 §10 |
| F-60 | M | Our price submissions retained 60 days | 05 §10 |
| F-61 | M | `price_submissions` stores a decision-time snapshot sufficient to replay the decision | 05 §6 |
| F-62 | M | Retention enforced nightly and configurable | 05 §10, 07 §1 |
| F-63 | M | Backfill from the legacy database, seeding repricing state so the catalogue is not re-probed | 05 §9, 12 Phase 8 |

## 7. Jobs & operations

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-64 | M | Automation runs in a supervised worker independent of any UI session | 07 |
| F-65 | M | Runs locally as a single process (`SINGLE_PROCESS=1`) and as separate processes on a server | 10 §1.1 |
| F-66 | M | Database-backed queue; no Redis or external broker | 10 §1.2 |
| F-67 | M | Single scheduler enforced by a lock with heartbeat | 07 §8 |
| F-68 | M | Configurable schedule and concurrency per job | 07 §8 |
| F-69 | M | Observation frequency tiered by listing phase and value | 07 §4 |
| F-70 | M | Graceful shutdown flushes pending batches | 07 §8, 09 §6 |
| F-71 | M | Global, per-marketplace and per-listing kill switches take effect immediately | 07 §9 |
| F-72 | M | Job runs recorded with counts and outcome, visible in the UI | 07 §1 |
| F-73 | M | Structured logging with a correlation id per run, persisted to `app_events` | 10 §9 |
| F-74 | M | Alerts for: below-floor price, submission failure rate, scrape failure rate, stale competitor data, budget exhaustion, job failure, unknown cost | 10 §9 |

## 8. User interface

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| F-75 | M | Web UI (Next.js 16, TypeScript, Tailwind), Turkish, usable locally and hosted | 06, 10 |
| F-76 | M | Setup wizard configures database, store, marketplaces, fees, policy and product source, testing each step | 10 §6 |
| F-77 | M | Nothing starts automatically after setup; the operator enables automation deliberately | 10 §6 |
| F-78 | M | Dashboard shows kill switches, budget, phase distribution, alerts, marketplace health | 06 §2 |
| F-79 | M | Listings grid server-paged, virtualised, structurally filtered | 06 §4 |
| F-80 | M | Competitor attributes shown as separate typed columns | 06 §4.1 |
| F-81 | M | Row highlighting semantics preserved from the legacy app | 06 §3, §4.2 |
| F-82 | M | Marketplace-pushing edits confirm, show pending/succeeded/failed, and preserve decimals | 06 §4.3 |
| F-83 | M | A manual price edit pauses automation for that listing for a configurable period | 06 §4.3 |
| F-84 | M | Listing detail explains the current price: cost waterfall, engine state, decision history | 06 §5 |
| F-85 | M | Competitor history reporting over the retained data, with export | 06 §6 |
| F-86 | M | Persisted, filterable event log | 06 §8 |
| F-87 | M | Settings audited; fee and policy changes offer a shadow "preview impact" | 06 §9 |
| F-88 | S | Bulk actions over the filtered selection | 06 §4.6 |

## 9. Configuration & security

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| N-1 | M | No credential in source, committed config, or a database column | 10 §8 |
| N-2 | M | All legacy credentials rotated before the repository is shared | 09 §1, 12 Phase 0 |
| N-3 | M | Every commercial and policy constant configurable at runtime | 08, 10 §8 |
| N-4 | M | Commercial parameters effective-dated | 02 §3 |
| N-5 | M | One source of truth for store identity per marketplace; merchant id preferred over name | 08 §3 |
| N-6 | M | All configuration changes audited (who, when, old, new) | 05 §2 |
| N-7 | S | Authentication on the web app; separate view and change-price permissions | 10 §2 |

## 10. Quality

| ID | Pri | Requirement | Spec |
|----|-----|-------------|------|
| N-8 | M | Every test vector in doc 02 §7 and scenario in doc 03 §11 passes | 12 Phase 2 |
| N-9 | M | Property tests: floor round-trip, monotonicity, never-below-floor, bracket ordering | 02 §7, 03 §11 |
| N-10 | M | Repository and migration suites green on all three engines in CI | 12 Phase 3 |
| N-11 | M | Adapter contract suite passes against fixtures for every adapter | 12 Phase 4 |
| N-12 | M | Cost model validated against real settlement statements **before enabling live writes**. 📌 Deferred — the product owner cannot do this yet; it does not block development, only Phase 8.4 | 12 Phase 0.3 / 8.3b |
| N-13 | M | Shadow-mode divergence from legacy fully explained before enabling writes | 12 Phase 8.3 |
| N-14 | M | `packages/core` is pure: no I/O, no clock, no randomness, no `any` | CLAUDE.md |

---

## 11. Resolved decisions

| # | Question | Answer |
|---|----------|--------|
| Q-1 | VAT rates | 1 / 10 / 20 by category, supplied by the marketplace listing API |
| Q-2 | Commission source | Marketplace listing API (`commission` on Trendyol V2; `commissionRate` and the Commission Information service on Hepsiburada), configurable fallback |
| Q-3 | Commission and cargo VAT | Treated as VAT-inclusive cost by default; configurable |
| Q-4 | Optimum-price behaviour | Climb to the ceiling, revert one step, hold; re-optimise on invalidation |
| Q-5 | Sole-seller margin | Operator-configured, not a constant |
| Q-6 | Scrape frequency | Operator-configured, tiered by listing state |
| Q-7 | Low-stock guard | Retained, configurable, plus a stock-mode switch |
| Q-8 | ERP access | Pluggable product sources; direct ERP stubbed for later |
| Q-9 | Legacy marketplaces | Farmazon, N11, GittiGidiyor dropped; new marketplaces addable |
| Q-10 | Per-listing price bounds | Yes — implement `minPrice`/`maxPrice` |
| Q-11 | Order import | MAY-ADD-LATER |
| Q-12 | Client | Web UI, Next.js 16 + TypeScript + Tailwind |
| Q-13 | Database | SQLite / PostgreSQL / MySQL via Drizzle; SQL Server dropped |
| Q-14 | Settle behaviour | Wait for price confirmation plus a configurable settle window |
| Q-15 | Climb strategy | Coarse step, then binary refinement |
| Q-16 | Retention | Competitor history indefinite; our price changes 60 days |

## 12. Still open

| # | Question | Blocks |
|---|----------|--------|
| O-1 | Trendyol public product-data request shape for the reporting scrape | Phase 7 |
| O-2 | Hepsiburada 🔴 items in `api-references.md` §2.9 | Phase 4.4 |
| O-3 | Is commission charged on the VAT-inclusive or the net price? (`commissionBase`) | Phase 8.3b only — ship a provisional default |
| O-4 | Current cargo tariff bands and expenditure bands per marketplace | Phase 8.3b only — ship provisional defaults |
| O-6 | 📌 Settlement validation of the whole cost model | Phase 8.4 (live writes). **Does not block development** |
| O-5 | Does Hepsiburada expose product VAT rate pre-sale? | Phase 4.4 |
