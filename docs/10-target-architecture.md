# 10 — Target Architecture

Decisions already made by the product owner are recorded here as settled. Everything else is a
recommendation with its reasoning.

| Decision | Choice |
|----------|--------|
| Client | Web UI — Next.js 16, TypeScript, Tailwind |
| Deployment | Must run both locally (single host, `node`) and on a server |
| Database | Engine-agnostic: SQLite, PostgreSQL, MySQL. Code-first, migrations, idempotent |
| ORM | Drizzle |
| Marketplaces | Trendyol + Hepsiburada; architecture must accept new ones |
| Product ingestion | Pluggable module: manual, Excel, marketplace listings, ERP DB, ERP API |
| Competitor history | Every scrape retained, timestamped, never overwritten |
| Retention | Our price changes 60 days; competitor/buybox history indefinite |
| Legacy marketplaces | Farmazon, N11, GittiGidiyor dropped |
| Orders | MAY-ADD-LATER |

---

## 1. Why not "just Next.js"

Next.js is the right client and API layer. It is the wrong host for the repricing loop:
serverless-oriented request lifecycle, no durable background execution, no supervised
long-running work.

The system therefore has **two processes over one database**, sharing one core library:

```
apps/web      Next.js — UI, API routes, setup wizard
apps/worker   long-running Node process — scrape, reprice, submit, confirm, import
```

Both are started by a single command locally. On a server they scale independently.

```
packages/
  core         pure domain — stock codes, cost, fees, pricing, decision engine
               NO I/O. NO database. NO clock. Fully unit-tested.
  adapters     marketplace + product-source adapters behind ports
  db           Drizzle schema, migrations, repositories
  jobs         job definitions and the DB-backed queue
  shared       types, Money, Result, config schema, logging
apps/
  web          Next.js 16 (App Router), Tailwind
  worker       job host
docs/          the specification
```

### 1.1 Single-process mode (local install)

```
SINGLE_PROCESS=1 npm start
```

boots the Next.js server and, in the same process, starts the worker's scheduler. This is the
"install node, run one command" path the operator asked for. The worker code is identical; only
its host differs.

```ts
// apps/web/instrumentation.ts
export async function register() {
  if (process.env.SINGLE_PROCESS === '1' && process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker } = await import('@app/worker');
    await startWorker();
  }
}
```

A lock row in the database guarantees only one scheduler is active even if both the embedded
and standalone workers are accidentally running.

### 1.2 No Redis

A Redis-backed queue (BullMQ) would break the local single-host requirement. The queue is
**database-backed**: a `job_queue` table with claim-by-update semantics, poll interval, visibility
timeout and retry count. It works identically on all three engines and adds no dependency.

```sql
-- claim pattern, portable across engines
UPDATE job_queue SET locked_by = ?, locked_until = ?
WHERE id = (SELECT id FROM job_queue
            WHERE state = 'ready' AND run_after <= ?
            ORDER BY priority, run_after LIMIT 1)
```

On PostgreSQL this can use `FOR UPDATE SKIP LOCKED`; on SQLite the writer is serialised anyway;
on MySQL a short transaction suffices. The repository layer picks the right strategy per dialect.

---

## 2. Layering

```
┌───────────────────────────────────────────────────────────┐
│  apps/web — Next.js                                       │
│  server components read via repositories                  │
│  route handlers issue commands                            │
│  setup wizard (§6)                                        │
└───────────────────────┬───────────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────────┐
│  packages/core — pure domain                              │
│    StockCode · CostCalculator · FeeModel · PriceCalculator │
│    RepricingPolicy · RepricingEngine.decide()             │
└───────────────────────┬───────────────────────────────────┘
                        │ ports
      ┌─────────────────┼──────────────────┬────────────────┐
      ▼                 ▼                  ▼                ▼
IMarketplaceAdapter  IProductSource   repositories      IClock/ILogger
  Trendyol             Manual         (packages/db)
  Hepsiburada          Excel
  (+ future)           MarketplaceListing
                       ErpDatabase  (stub)
                       ErpApi       (stub)
      ▲
┌─────┴─────────────────────────────────────────────────────┐
│  apps/worker — scheduler + jobs                           │
│  rate limiting · retry/backoff · circuit breaker          │
│  outbox · confirmation · update budget                    │
└───────────────────────────────────────────────────────────┘
```

**The dependency rule:** `core` depends on nothing. `adapters` and `db` depend on `core`.
`web` and `worker` depend on everything. Nothing depends on `web` or `worker`.

---

## 3. The marketplace port

```ts
interface IMarketplaceAdapter {
  readonly code: MarketplaceCode;
  readonly capabilities: MarketplaceCapabilities;   // doc 03 §9

  testConnection(creds: Credentials): Promise<ConnectionTestResult>;

  fetchListings(cursor?: string): AsyncIterable<ListingSnapshot>;
  fetchBuyboxObservations(listingIds: string[]): Promise<BuyboxObservation[]>;
  fetchCompetitorDetail?(listingIds: string[]): Promise<CompetitorSnapshot[]>;  // optional

  submitPriceChanges(batch: PriceChange[]): Promise<SubmissionHandle>;
  pollSubmission(handle: SubmissionHandle): Promise<SubmissionResult>;

  fetchOrders?(window: DateRange, cursor?: string): AsyncIterable<OrderSnapshot>; // MAY-ADD-LATER
}
```

Rules:

- **No marketplace sentinel ever escapes an adapter.** `"< ? >"`, `-1`, `"Error"`, `"No Seller"`
  are translated to `null` or a typed error at the boundary.
- **No formatted string ever escapes an adapter.** Competitor price, rating, name and dispatch
  time are separate typed fields. (Doc 09 §12, §29.)
- Each adapter owns its own rate limiter, keyed per API domain — Hepsiburada needs three
  independent limiters (listing / orders / catalogue), Trendyol one per service group.
- Adapters are tested against **recorded response fixtures**, never live APIs.

Adding a marketplace means adding one directory under `packages/adapters` and one row in the
marketplace registry. Nothing in `core` changes.

---

## 4. The product source port

Products enter the system through a pluggable source. This is a first-class requirement, not an
import script.

```ts
interface IProductSource {
  readonly code: ProductSourceCode;
  readonly displayName: string;
  readonly status: 'available' | 'comingSoon';
  readonly configSchema: ZodSchema;          // drives the UI form automatically

  testConnection?(config: unknown): Promise<ConnectionTestResult>;
  fetch(config: unknown): AsyncIterable<StockItemInput>;
}

interface StockItemInput {
  baseStockCode: string;
  name:          string;
  unitCost:      Money;      // VAT-exclusive
  unitStock:     number;
  sourceRef?:    string;
}
```

Five implementations:

| Source | Status | Behaviour |
|--------|--------|-----------|
| `Manual` | available | Operator adds or edits a stock item in the UI, one at a time |
| `Excel` | available | Upload a spreadsheet; **column mapping is configured in the UI**, not hardcoded |
| `MarketplaceListing` | available | Derive stock items from imported marketplace listings (base stock codes discovered from seller SKUs). Cost must then be supplied manually or by another source |
| `ErpDatabase` | comingSoon | Direct SQL against the ERP. Registered, config schema defined, `fetch()` throws `NotImplemented`. UI shows it disabled with "coming soon" |
| `ErpApi` | comingSoon | Same, over HTTP |

Every ingestion run is idempotent: upsert by `baseStockCode`, and **never overwrite
operator-owned fields** (price multipliers, automation switches, per-listing bounds).

> The legacy Excel import hardcoded worksheet name `Ürünler` and read columns by position.
> Mapping must be configurable and previewed before commit.

---

## 5. Competitor history — two tiers

The operator requires that every scrape be retained: all sellers, all their data, timestamped,
never overwritten.

Stored naively this is unworkable. 5,000 listings × 10 sellers × hourly ≈ **1.2 M rows/day**,
440 M/year — beyond SQLite entirely and unqueryable on MySQL.

The design preserves full fidelity at a fraction of the volume:

```
scrape_runs              one row per listing per scrape, ALWAYS written
  listing_id, source, observed_at, seller_count, payload_hash, status

competitor_observations  one row per seller per scrape, written ONLY when something changed
  listing_id, observed_at, rank, seller_name, seller_id, price, final_price,
  rating, dispatch_time, offered_stock, has_promotion, promotion_text
```

The question *"what did the offers look like at 21:00?"* is answered exactly: find the
`scrape_runs` row at 21:00 (proving we looked), then take the latest
`competitor_observations` at or before that timestamp. Nothing is lost; roughly 3–5% of the
rows are written.

`payload_hash` makes change detection a single comparison, and lets a future migration
reconstruct exactly which runs were no-ops.

**Retention:** `competitor_observations` and `scrape_runs` are kept **indefinitely** — they are
the reporting asset. Our own `price_submissions` are pruned after **60 days**.

### 5.1 Two data paths, two purposes

| Path | Source | Drives | Failure impact |
|------|--------|--------|----------------|
| **Control** | Official buybox API (Trendyol `buybox-information`; Hepsiburada buybox rank) | The repricing decision | Repricing stops — alert |
| **Reporting** | Public product data / scrape | Competitor history, seller identity trigger, analytics | Reporting degrades; **repricing continues** |

This separation is the single most valuable structural change over the legacy system, where a
page-layout change silently stopped all repricing.

---

## 6. First-run setup wizard

On first launch — and reachable later from settings — the app walks the operator through
configuration, **testing each step before accepting it**.

```
1. Database
     engine (SQLite / PostgreSQL / MySQL) · connection details
     → Test connection → Run migrations → Verify schema version

2. Store identity
     store display name · per-marketplace merchant/seller id

3. Marketplaces (repeatable, one per marketplace)
     credentials → Test: perform a real read call (e.g. fetch 1 listing)
     → show what came back so the operator can confirm it is the right store

4. Fee settings per marketplace
     commission VAT rate & treatment · cargo bands · expenditure bands
     → live preview: "a product costing X with VAT Y has floor price Z"

5. Repricing policy per marketplace
     steps · tolerance · sole-seller margin · stock mode · settle time
     · poll interval · daily update budget

6. Product source
     choose source → configure → Test → preview the first 20 rows before committing

7. ERP connection (optional, skippable)
     reserved for the ErpDatabase / ErpApi sources

8. Review & finish
     everything starts DISABLED. The operator explicitly enables automation
     per marketplace afterwards.
```

Configuration is validated by Zod schemas that also generate the forms. Secrets are written to
the secret store, never to the settings table (§8).

**Nothing starts automatically after setup.** A freshly configured system imports and observes;
the operator turns on repricing deliberately.

---

## 7. Database portability

Drizzle with three dialects. Rules that keep the schema portable:

| Concern | Rule |
|---------|------|
| Money | `bigint` minor units. SQLite has no decimal; this is the only portable exact representation |
| Timestamps | Store UTC as integer epoch milliseconds. Time-zone handling differs across engines |
| Booleans | `integer` 0/1 everywhere. SQLite has no boolean |
| JSON | Only for genuinely schemaless payloads (raw API responses, band definitions). Never for queryable data |
| Enums | `text` with a check constraint. Native enums are not portable |
| Identity | Application-generated UUID v7. Auto-increment semantics differ |
| Upsert | Through a repository helper that emits the right dialect syntax |
| Migrations | One migration set per dialect, generated by Drizzle Kit, **all three run in CI** |

Migrations must be **idempotent and forward-only**. On boot the app compares the schema version
and refuses to start on a mismatch, offering to migrate.

> Recommendation: SQLite for local single-operator installs, PostgreSQL for anything shared.
> MySQL is supported because the legacy database is MySQL and eases migration.

---

## 8. Configuration and secrets

Three layers:

| Layer | Where | Contents |
|-------|-------|----------|
| Bootstrap | Environment variables | Database URL, secret-store key, `SINGLE_PROCESS` |
| Secrets | Encrypted secret store (env-derived key locally; a managed manager on a server) | Marketplace credentials, ERP credentials |
| Settings | Database, effective-dated where commercial | Fee settings, policies, product-source config, store identity |

**No credential in source, in committed config, or in a plain-text database column.**
Every settings change is audited: who, when, old value, new value.

Fee settings are **effective-dated** so a price decision made last month can still be explained
with the rates that applied then.

---

## 9. Observability

| Concern | Mechanism |
|---------|-----------|
| Logging | Structured, correlation id per job run, persisted to `app_events` |
| Job history | `job_runs`: start, end, item counts, success/failure, error |
| Decision trail | Every decision persists reason + explanation, visible per listing in the UI |
| Alerts | Listing priced below floor · submission failure rate · scrape failure rate · stale competitor data · budget exhausted · job failure · cost unknown |
| Budget | Remaining daily update allowance per marketplace, shown in the UI |
| Health | `/api/health` reporting database, marketplace reachability, worker heartbeat |

---

## 10. Testing strategy

| Layer | Approach |
|-------|----------|
| `core` | Table-driven unit tests from the vectors in doc 02 §7 and the scenarios in doc 03 §11. Property tests for round-trip and monotonicity |
| `adapters` | Recorded response fixtures. A contract test suite every adapter must pass |
| `db` | Migrations applied and repositories exercised against **all three engines** in CI |
| `jobs` | Fake clock, fake adapters; assert scheduling, retry, backoff, budget admission |
| `web` | Component tests for grids and filters; e2e for the setup wizard |
| System | **Shadow mode** (§11) |

---

## 11. Migration plan

**Phase 0 — Safety**
1. Rotate every credential in the legacy repository (doc 09 §1).
2. Confirm current commission, VAT, cargo and expenditure figures against real settlement
   statements. The legacy `1.18` VAT multiplier is stale and product VAT is missing entirely
   (doc 02 §6.1).

**Phase 1 — Domain**
3. Build `packages/core` and `packages/shared`.
4. Make every test vector in doc 02 §7 and every scenario in doc 03 §11 pass.

**Phase 2 — Data**
5. Build `packages/db`: schema, migrations, repositories. CI green on all three engines.
6. Backfill from the legacy MySQL database: stock items, listings, bundles, and the most recent
   price change per listing as the initial repricing state.

**Phase 3 — Adapters, read-only**
7. Trendyol adapter: listing import, buybox observation. Hepsiburada adapter: same.
8. Run import jobs against the new schema alongside the legacy system. Compare.

**Phase 4 — Shadow mode**
9. Run the engine over live data with submission disabled. Log every decision it *would* make.
10. Diff against what the legacy system actually did. **Every divergence must be explained** as
    either a legacy bug (doc 09) or a porting error. Do not proceed until the diff is fully
    accounted for. Expect large divergence on floor prices — that is doc 02 §6.1, and it is the
    point.

**Phase 5 — Writes, one marketplace at a time**
11. Enable Hepsiburada first: its competitor data comes from an official API, so it does not
    depend on scraping, and the quota constraint makes the OPTIMUM behaviour immediately
    observable.
12. Watch for a week with a tight kill switch and an alert on any price below floor.
13. Then Trendyol.

**Phase 6 — Client and decommission**
14. Build the operator UI. Keep the legacy app read-only until the operator is comfortable.
15. Retire the legacy app, its stored functions, and the dead tables.

---

## 12. Explicitly dropped

| Dropped | Reason |
|---------|--------|
| GittiGidiyor, N11, Farmazon | Product owner decision; the adapter port makes re-adding cheap |
| All MySQL stored functions and views | Logic belongs in `core` |
| JSON blob columns for competitor data | Replaced by typed tables |
| Formatted-string columns (`"a / b"`) | Replaced by typed fields |
| Scraping on the control path | Replaced by the official buybox APIs |
| Sentinel values (`999`, `-1`, `"Error"`, `"< ? >"`) | Replaced by `Result` types |
| The legacy Trendyol `sapigw` integration | Host retired by Trendyol |

## 13. Explicitly added

| Added | Reason |
|-------|--------|
| Per-listing `minPrice` / `maxPrice` | Best single runaway guard; columns existed in the legacy schema but were never implemented |
| Update-budget admission control | Hepsiburada's 10× daily quota is a hard limit (doc 03 §8) |
| Confirmation + settle gating | Prevents recording an optimum from stale data |
| Decision explanations | Operator trust and debuggability |
| Two-tier competitor history | The reporting asset the operator asked for |
| Pluggable product sources | Manual / Excel / marketplace now; ERP later |
| Setup wizard with live connection tests | No hand-edited config files |
| Shadow mode | De-risks the cutover |
| Retention policies | Three legacy tables grow forever |
