# 07 — Processes & Jobs (target specification)

Implementation home: `packages/jobs` (definitions) and `apps/worker` (host).

Automation runs in a supervised worker process, independent of any UI session. Locally the
worker can be embedded in the web process (`SINGLE_PROCESS=1`, doc 10 §1.1); the job code is
identical either way.

---

## 1. Job inventory

Every cadence below is a **default**, not a fixed value — an operator can override any of them
per job from the Jobs screen (§8 "Operator-configurable cadence").

| Job | Default cadence | Purpose |
|-----|-----------------|---------|
| `ImportStockItems` | on demand + daily | Pull products/costs from the configured `IProductSource` |
| `ImportBundles` | daily | Rebuild bundle definitions |
| `ImportListings` | per marketplace, 30 min | Full listing sync: price, stock, commission, VAT, status |
| `ObserveBuybox` | per marketplace, tiered (§4) | Official buybox API → `buybox_observations` |
| `ScrapeCompetitors` | per marketplace, hourly, tiered (§4) — **disabled by default** | Full seller detail → `scrape_runs` + `competitor_observations` (reporting only, §7) |
| `Reprice` | per marketplace, policy interval | Decide; enqueue `price_submissions` |
| `SubmitPriceChanges` | continuous | Drain the outbox in marketplace-sized batches |
| `ConfirmSubmissions` | continuous | Poll batch status to a terminal state |
| `ResetBudget` | daily, marketplace midnight | Roll `update_budget_usage` |
| `PruneHistory` | nightly | Apply retention (doc 05 §10) |
| `ImportOrders` | — | **MAY-ADD-LATER** |

Every run writes a `job_runs` row and carries a correlation id through every log line.

A long-running handler MAY also heartbeat its progress through `JobContext.reportProgress`
(`{done, total, currentItem}`), which the runner throttles to at most one `job_runs` write per
second and settles before the run's terminal write. This is what makes a run watchable from the
web process (doc 06 §7.2, doc 05 §7). It is **reporting only** on exactly the terms §7 sets for
competitor data: not reporting is fully supported, a failed progress write never fails the run,
and no decision may branch on it. `ScrapeCompetitors` reports; the other jobs do not yet.

### 1.1 What each job actually does

One entry per row in `JOB_CATALOG` (`packages/jobs/src/job-catalog.ts`), which is the single
source of truth the Jobs screen (doc 06 §7) reads its schedule/enabled-state/default-payload
from — this table must never drift from that file.

**`ImportStockItems`** (`pipeline/import-stock-items.ts`) — reads the configured
`IProductSource` (manual / Excel / marketplace-listing-derived / ERP) and upserts `stock_items`
by `baseStockCode`. Plain upsert, no `ensure`/`update` split: `stock_items` itself holds no
operator-owned fields (those live on `stock_marketplace_prefs`), so re-running it can never
clobber an operator's choice. Global, not per marketplace. On-demand by default (no dedicated
cadence config surfaced beyond doc 07 §1's "on demand + daily").

**`ImportBundles`** (`pipeline/import-bundles.ts`) — rebuilds bundle definitions from a
resolved bundle list (`{bundleStockCode, name, members[]}`) given directly in the payload, via
`replaceBundle`'s upsert-bundle + delete-old-members + insert-new-members transaction (doc 01
§6). Has **no cadence** (`cadenceMs: null` in the catalog): no bundle-source port exists yet
(doc 10 §4), so today this only ever runs from an explicit "run now" with a payload someone
supplies by hand, never on a ticker.

**`ImportListings`** (`pipeline/import-listings.ts`) — full per-marketplace listing sync: price,
stock, commission, VAT rate, campaigns, sale/lock/archive status. Idempotent upsert plus a stale
sweep gated on full success (doc 07 §6): every page from the adapter is upserted with
`last_seen_at = runStartedAt`; only after the *entire* run succeeds are listings with a stale
`last_seen_at` marked inactive — a partial import never marks live listings inactive
(doc 09 §25's legacy delete-first bug, deliberately not repeated). A listing whose seller SKU
doesn't parse to a `baseStockCode` is skipped and logged, not failed. Never touches the
operator-owned override fields (`minPrice`/`maxPrice`/`allowIncrease`/`allowDecrease`/
`repriceEnabled`/`observationEnabled`) on an existing row — those are set only by an explicit
UI action (§2.2 below). Per marketplace, every 30 min by default.

It also refreshes `marketplaces.merchant_ref` from `IMarketplaceAdapter.merchantRef` — our own
seller id at that marketplace, taken from the credentials the adapter authenticates with. Only a
real difference is written, and a change is audited.

This is the *second* of two triggers, not the guarantee. The guarantee is at **worker startup**,
where every adapter is constructed (`buildAdapters`, `apps/worker`): that runs whatever the
operator has enabled, and this job can be switched off while `ScrapeCompetitors` — which needs
the value to tell our own offer from a competitor's — keeps running. That combination is not
hypothetical; it was the live configuration on 2026-08-18. Doing it here as well means a
credential change is picked up on the next import rather than only on the next restart.

**`ObserveBuybox`** (`pipeline/observe-buybox.ts`) — the **control-path read**: calls the
marketplace's official buybox API and writes `buybox_observations` (rank, buybox/2nd/3rd
price). Candidates come from `listObservableListings` (`observation_enabled = 1`, §2.2) —
**not** `Reprice`'s eligibility query. Each candidate is assigned an observation tier (Hot /
Warm / Cold / Frozen, doc 07 §4) from its repricing phase, lock state, offered stock and
whether it recently lost the buybox; only listings whose tier interval has elapsed since they
were last observed are actually polled (§4.1). Skips outbound calls entirely while the marketplace's circuit breaker is
open (doc 07 §3). Per marketplace, ticked every 60 s by default (the tiering, not the tick
rate, is what keeps this cheap).

**`ScrapeCompetitors`** (`pipeline/scrape-competitors.ts`) — the **reporting-only** read:
fetches each candidate listing's public product page/endpoint and writes `scrape_runs` (always)
plus `competitor_observations` (only when the payload hash changed since the last successful
run). Candidates also come from `listObservableListings`, same tiering shape as `ObserveBuybox`
but on its own cadence/config (`scrape-config.ts`). Deliberately isolated from the control path:
reads a separate `ctx.competitorSources` registry (never the marketplace adapter), never trips
the marketplace circuit breaker, never returns a job-level error for one bad page (failures are
counted and the **rate** alerts, not each failure), and writes only `scrape_runs` /
`competitor_observations` / `competitor_sellers` — never `repricing_state`, `price_submissions`
or `buybox_observations`. **Disabled by default** (`defaultEnabled: false` — the only job in the
catalog that is); an operator must turn it on explicitly per doc 04 §1.5 / api-references §1.6.
Per marketplace, hourly by default when enabled.

Two details of the write path matter (doc 05 §5 records both in full):

- **The change-detection hash covers `(rank, seller_ref, price, final_price)` only.** Narrowing
  it changes *when* a batch is written, never *what* — the rows still carry every field, so
  point-in-time reconstruction is unaffected. Measured 2026-08-18: `offered_stock` alone drove
  53 of 124 batch rewrites with no competitive event behind them, while every one of the 55
  rank-only transitions was a real buybox hand-over and so still triggers a write.
- **Seller identities are upserted into `competitor_sellers` once per run**, after the loop,
  under their own `try`/`catch`. The same merchants recur across most of a catalogue, so one
  deduplicated batch replaces thousands of writes; and because this table is a convenience for
  reporting rather than the scrape's actual output, a failure here logs `warn` and is
  swallowed. It must never fail a page, a run, or the queue.

**`Reprice`** (`pipeline/reprice.ts`) — the decision engine. For each listing eligible under
§2.1 (`reprice_enabled = 1` and `stock_marketplace_prefs.auto_reprice_enabled = 1`), loads cost
(`CostCalculator.unitCost`), effective fees, current `repricing_state` and today's
`update_budget_usage`, calls `packages/core`'s pure `decide()`, persists the resulting state,
and — only if the decision is `submit` — inserts a `price_submissions` row with
`state: 'queued'`. **This job never writes a price itself**; it only ever populates the outbox.
Supports `mode: 'shadow'` (doc 07 §10): decisions are computed and persisted exactly as in live
mode, but the row is written `state: 'cancelled'` with a shadow marker instead of `queued`, so
`SubmitPriceChanges` never drains it — used for policy-change previews and reproducing a past
decision. Per marketplace, on the policy's configured interval (5 min by default).

**`SubmitPriceChanges`** (`pipeline/submit-price-changes.ts`) — drains `price_submissions` in
`queued` state, admitting by priority (doc 03 §8) against **remaining** budget
(`allowance − consumed`, budget is not touched here — only on confirmation), batches up to the
marketplace's maximum, and calls the adapter's price-submit endpoint. Honours global and
per-marketplace kill switches (doc 07 §9) and the circuit breaker. On success, rows move to
`state: 'submitted'` with the marketplace's batch handle stored for `ConfirmSubmissions` to
poll. Per marketplace, continuous — ticked every 30 s by default.

**`ConfirmSubmissions`** (`pipeline/confirm-submissions.ts`) — polls each pending marketplace
batch handle to a terminal state. Confirmed rows move to `state: 'confirmed'`, `settle_until` is
set, and **only here** is budget consumed (CLAUDE.md hard rule: the audit record — and the
budget spend — advance only after the marketplace confirms). Failed/rejected rows are
classified via `classifyRejection` (priceRange / campaign / quota / validation, doc 03 §7.1)
against the marketplace's raw failure text. A batch stuck pending past
`confirmationTimeoutMs` (3 h default — shorter than Trendyol's 4-hour result-retention window)
is marked `failed` and alerted rather than left stuck forever. Per marketplace, continuous —
ticked every 60 s by default.

**`ResetBudget`** (`pipeline/reset-budget.ts`) — ensures today's `update_budget_usage` row
exists with `consumed: 0` and an allowance computed from the marketplace's current repriceable
listing count (`adapter.capabilities.dailyUpdateAllowance`). Actual midnight rollover is free
(usage is keyed by `(marketplaceCode, usageDate)`, so a new date is automatically a fresh row
the moment anything increments it) — this job only makes the day's allowance visible in the UI
*before* the first confirmation lands. Per marketplace, hourly (idempotent — cheap to over-run,
`ensureBudgetUsageRow` is a no-op once the row for the day exists).

**`PruneHistory`** (`pipeline/prune-history-job.ts`) — thin wrapper around `packages/db`'s
`pruneHistory`, which applies every retention window from doc 05 §10 (price submissions, buybox
observations, app events by level, job runs, finished job-queue rows). Global, nightly by
default.

**`ImportOrders`** — **MAY-ADD-LATER** (doc 12), not implemented; no file exists yet.

---

## 2. The repricing pipeline

The pipeline is deliberately split so that observation, decision and submission fail
independently.

```
ImportListings ──▶ listings (price, stock, commission, vatRate, campaigns, status)
                        │
ObserveBuybox ─────────▶ buybox_observations (rank, buybox/2nd/3rd price)
                        │
ScrapeCompetitors ─────▶ scrape_runs + competitor_observations   [reporting only]
                        │
                        ▼
                    Reprice
                      for each eligible listing:
                        cost   = CostCalculator.unitCost(...)
                        fees   = fee_settings effective now
                        state  = repricing_state
                        budget = update_budget_usage
                        decision = RepricingEngine.decide(...)      ← pure
                        persist nextState
                        if decision.action == 'submit':
                            insert price_submissions (state = 'queued')
                        else:
                            record the reason for the UI
                        │
                        ▼
              SubmitPriceChanges
                        drain queued by (priority, decided_at)
                        respect budget, rate limits, concurrency caps
                        batch up to the marketplace maximum
                        → state = 'submitted', store marketplace_handle
                        │
                        ▼
              ConfirmSubmissions
                        poll marketplace_handle
                        confirmed → state='confirmed', settle_until set,
                                    budget consumed
                        failed    → state='failed'|'rejected', classify (doc 03 §7.1)
```

**No job writes a price directly.** Everything goes through `price_submissions`, which is
simultaneously the outbox, the audit trail and the idempotency memory.

### 2.1 Eligibility query for `Reprice`

```sql
SELECT ... FROM listings l
JOIN stock_marketplace_prefs p
  ON p.base_stock_code = l.base_stock_code
 AND p.marketplace_code = l.marketplace_code
WHERE l.marketplace_code = ?
  AND l.is_salable = 1 AND l.is_locked = 0 AND l.is_archived = 0
  AND l.reprice_enabled = 1
  AND p.auto_reprice_enabled = 1
```

Listings whose `base_stock_code` is null (unparseable seller SKU) are excluded and reported.

### 2.2 Eligibility for `ObserveBuybox` and `ScrapeCompetitors`

Both read their candidate listings from `l.marketplace_code = ? AND l.is_salable = 1 AND
l.observation_enabled = 1` — deliberately **not** the §2.1 query above. `observation_enabled`
is a separate per-listing flag from `reprice_enabled`: an operator can watch buybox rank and
competitor activity on a listing that is not, and may never be, opted into the pricing engine
(and vice versa — a repriceable listing is not automatically observed). Like
`reprice_enabled`, it starts disabled on import and is only ever changed by an explicit
operator action (doc 06 §4.6's bulk actions, or the per-row grid toggle).

---

## 3. Rate limiting, retry, circuit breaking

Every outbound call passes through a limiter keyed by **marketplace + API domain**, because
quotas differ per domain (doc api-references §2.1).

| Marketplace | Domain | Limit |
|-------------|--------|-------|
| Trendyol | any endpoint | 50 req / 10 s |
| Trendyol | product read group | 1,000–2,000 req/min by tier |
| Trendyol | inventory & price write | 350–2,000 req/min by tier |
| Hepsiburada | listing | batch ≤ 4,000; ≤ 5 concurrent uploads; 10× daily |
| Hepsiburada | orders | 1,000 req/s; **honour `X-RateLimit-*` response headers** |
| Hepsiburada | catalogue | 180 req/min/IP |

Policy:

- **Retry** on 429 and 5xx with exponential backoff and jitter; respect `Retry-After` and
  `X-RateLimit-Reset` when present.
- **Do not retry** business rejections (doc 03 §7.1).
- **Circuit breaker** per marketplace: after N consecutive transport failures, open the
  circuit, stop outbound calls, raise an alert. Half-open probe after a cooldown.
- A tripped circuit **must not** silently disable repricing — the UI shows the marketplace as
  degraded.

---

## 4. Tiered observation

Buybox observation is the highest-frequency job and the one that consumes the most quota.
Polling every listing at the same rate is wasteful and, on Hepsiburada, impossible.

Each listing carries a computed **observation tier**:

| Tier | Criteria | Buybox poll | Scrape |
|------|----------|-------------|--------|
| Hot | In `CLIMBING`, `REFINING` or `SEEKING`; or lost the buybox recently | every cycle | frequent |
| Warm | `OPTIMUM`, high turnover or high value | every N cycles | daily |
| Cold | `OPTIMUM` and low value; or `BLOCKED` | infrequent | weekly |
| Frozen | Automation disabled, locked, out of stock | not polled | not scraped |

Tier is recomputed after each repricing pass. The tiering function is configurable and its
inputs (phase, recent sales if available, price, margin) are recorded so the operator can see
why a listing is polled at its rate.

> This is what makes the design scale. Trendyol's buybox endpoint accepts 10 barcodes per call
> at 1,000 calls/min; the constraint is not the API but the wasted work of re-observing
> thousands of listings that are sitting quietly at their optimum.

### 4.1 Two scaling gaps — found 2026-08-24, both fixed 2026-08-26

Neither showed up on a small catalogue, and neither reported an error when it bit: the job
completed, and some listings simply never appeared in the data. Recorded here in full because
the shape of each mistake is worth keeping, and because the fix for G-1 deliberately departs
from what this section originally proposed.

**G-1 — the cycle counter was always zero, so the tier cadences above did nothing.** ✅ Fixed.
`apps/worker` passed a literal `{ cycleNumber: 0 }` on every `ObserveBuybox` and
`ScrapeCompetitors` trigger. It was never incremented and never persisted, so the due-ness
tests evaluated `0 % 24 === 0` and `0 % 168 === 0` — both true, every time. Warm was not daily
and Cold was not weekly; every non-Frozen listing was treated as due on every cycle. It cost
calls, not correctness.

*Fixed not with a counter but with elapsed time.* A listing is due when the time since it was
last observed (or last **successfully** scraped) reaches `N × cycleMs`. The counter this
section originally proposed was rejected on implementation for three reasons:

- It has to survive restarts to mean anything, and persisting it makes a per-tick
  `app_settings` write whose audit trail is noise. Putting it in the job payload instead breaks
  `countActiveJobsForPayload`'s one-run-at-a-time guard (§8) — the payload would differ on
  every tick, so the guard would never match and a slow run would queue duplicates.
- It measures firings, not time. After the worker is down for three days a counter says one
  cycle has passed, so a Cold listing waits another week having already gone ten days unseen.
- `% N === 0` is not "every N cycles" per listing; it is "on cycles divisible by N" for the
  whole catalogue, so every Warm listing falls due in the same tick and none in the other 23 —
  exactly the burst tiering exists to avoid.

The tier intervals are **absolute durations**, resolved from each handler's own `cycleMs`
default rather than from the ticker's cadence. Tying them to the cadence would mean an operator
lowering it to 15 minutes (§8.1 permits this) silently turned "daily" into "six-hourly": the
tick rate is the resolution at which due-ness is checked, not the tier interval itself.

**G-2 — nothing rotated past `SCRAPE_MAX_LISTINGS_PER_RUN`, so listings beyond it were never
scraped at all.** ✅ Fixed. `listObservableListings` has no `ORDER BY` and takes no offset, and
`scrapeCompetitors` breaks out of its loop once `due` reaches the ceiling (200), so the same
first 200 rows were selected on every run, in whatever order the engine returned them. At 1,000
observable listings, 200 were scraped hourly and **800 were never scraped** — with the run
reporting `completed` and no failures, so nothing surfaced it. Reporting-only, so no pricing
decision was wrong, but the competitor reports were silently partial. `ObserveBuybox`, which
*is* on the pricing path, has no such ceiling and was unaffected.

*Fixed* by sorting candidates on last successful scrape (oldest first, never-scraped first)
before the ceiling is applied, so the cut-off rotates through the catalogue. The ordering key
comes from one grouped aggregate (`competitionRepo.lastSuccessfulScrapeAtByListing`), not N
per-listing queries. Asserted by `scrape-competitors.test.ts`'s "the per-run ceiling rotates":
four candidates, a ceiling of two, two consecutive runs, disjoint sets covering all four.

Measured from the last **successful** scrape for the same reason change detection is (§7): a
failed run tells us nothing about the listing, and counting it as a look would let a listing
that fails every time drift out of the rotation permanently.

---

## 5. Budget management

```
ResetBudget            at marketplace midnight, set consumed = 0,
                       allowance = f(current listing count)

SubmitPriceChanges     before each batch:
                         remaining = allowance − consumed
                         reserve   = allowance × reservePct
                         admit submissions by priority (doc 03 §8)
                         never exceed remaining
                       after confirmation:
                         consumed += confirmed item count
```

Budget is consumed on **confirmation**, not submission, so failed batches do not burn it. When
remaining budget drops below the reserve, only priority 0–1 decisions are admitted, and the UI
shows a warning.

---

## 6. Import semantics

Every import is an **idempotent upsert plus a stale sweep**. Never delete-then-reload.

```
ImportListings:
    runStartedAt = now
    for each page from the adapter:
        upsert listings, set last_seen_at = runStartedAt
        replace listing_campaigns for the listing
    after a fully successful run:
        mark listings with last_seen_at < runStartedAt as inactive
```

The stale sweep runs **only on a fully successful pass** — a partial import must never mark
live listings inactive. This is the failure the legacy delete-first pattern guaranteed
(doc 09 §25).

`ImportStockItems` upserts by `base_stock_code` and **never touches operator-owned fields**
(`price_multiplier`, `auto_reprice_enabled`, `min_price`, `max_price`, `allow_*`).

---

## 7. Scraping job

`ScrapeCompetitors` is **reporting-only** and must be isolated from the control path.

```
for each listing in the scrape tier:
    fetch public product data
    always insert scrape_runs { observed_at, seller_count, payload_hash, status }
    if payload_hash != last hash for this listing:
        insert competitor_observations rows
        scrape_runs.changed = 1
```

Requirements:

- Rate-limited and concurrency-capped independently of the marketplace APIs.
- Caching: identical requests within a short window are served from cache.
- Parse failures are recorded as `scrape_runs.status = 'parseFailed'` and counted; the
  failure **rate** raises an alert, not each individual failure.
- **A scrape failure never blocks a repricing decision.** The seller-identity invalidation
  trigger is simply skipped when data is unavailable (doc 03 §6.5).
- Change detection compares against the last **successful** run. A failed run writes its
  proof-of-look row with `changed = 0` and no observations; comparing against it would make
  the next good scrape look changed and rewrite an identical seller set into an archive that
  is retained indefinitely (doc 05 §10).
- A ceiling on pages fetched per run, so one cycle can never become an unbounded crawl of the
  whole catalogue. Listings beyond it are picked up next cycle.
- **The job is disabled by default.** Reading either public source needs an explicit business
  decision (api-references §1.6, §2.11); an operator enables it from the Jobs screen. Every
  other job in §1 defaults to enabled.
- A listing with no public product reference is skipped, not failed — a reporting gap.
- **A competitor's unit is never assumed.** A value whose unit the payload does not state is
  left unknown rather than mapped; both sources leave competitor dispatch time null unless the
  payload names the unit.

**Marketplace coverage.** Both marketplaces have a competitor source, and they read different
kinds of thing:

| Marketplace | Source | Specified in | Status |
|---|---|---|---|
| Trendyol | product page with embedded state | api-references §1.6 + `trendyol-merchants-scraping-guide.md` | implemented, collects data |
| Hepsiburada | public JSON listings endpoint | api-references §2.11 | implemented and **live** since Phase 4.4 (2026-08-14): `fetchListings` now carries the product SKU it keys on as `ProductPageRef.contentId`. Collects nothing until real merchant credentials are configured, which is a supported state, not a failure |

Nothing in this job differs between them: tiering, change detection, failure-rate alerting and
the per-run ceiling are all marketplace-agnostic, and a source that collects nothing is a
supported state, not a failure.

---

## 8. Scheduling and concurrency

The scheduler is DB-backed (doc 10 §1.2). Guarantees:

- **One scheduler at a time.** A lock row with a heartbeat; a second instance waits.
- **One run per job at a time**, unless the job declares itself parallel-safe.
- **Per-marketplace concurrency limits** from `repricing_policies.concurrency`.
- **Visibility timeout**: a claimed job whose lock expires is returned to `ready`. A running
  handler heartbeats its own claim (`jobsRepo.renewJobLock`, every half of the timeout) so a
  legitimately long run — e.g. `ScrapeCompetitors` walking up to `SCRAPE_MAX_LISTINGS_PER_RUN`
  pages one at a time — is never mistaken for a crashed worker and reclaimed by a second run
  while the first is still going. Only a worker that has actually stopped heartbeating (crashed
  or killed) ever has its claim expire and get requeued.
- **Bounded retries** with backoff; exhausted jobs move to `failed` and alert. A retry is also
  skipped — the job moves straight to `failed` — if the operator disabled the job (doc 12 6.9)
  since it was claimed, so switching a job off stops its own in-flight retry chain immediately
  rather than only preventing the *next* cadence-driven enqueue. A manual "run now" is
  unaffected: disabling only gates cadence enqueueing and retries, never an explicit trigger.
- **One run at a time, per target.** A cadence-driven job is never enqueued while a copy of it
  is still `ready` or `locked`. `Scheduler.tick` enforces this for the jobs it cadences itself
  (`countActiveJobs`, keyed on job name); `apps/worker`'s per-marketplace tickers call
  `enqueueNow` directly and so enforce it themselves with `countActiveJobsForTarget`, keyed on
  job name **and the target marketplace**. The target half is not optional: keying on the name
  alone would let a slow Trendyol run suppress the Hepsiburada one, which stops repricing a
  marketplace instead of merely wasting quota.

  **The target is parsed out of the payload, not compared as a string** — a distinction that
  cost a real incident. Until 2026-08-26 this compared payloads for exact string equality, on
  the reasoning that each tick builds the same literal shape and so emits byte-identical JSON.
  That holds within a build and stops holding across one. When `cycleNumber` was removed from
  the observation payloads (§4.1 G-1), a queued row written by the previous build survived the
  upgrade and matched nothing the new build produced, so the guard admitted a **second
  concurrent `ScrapeCompetitors` against the same marketplace** — the exact pattern
  api-references §1.6 warns about, and it produced an immediate run of fetch failures. Any
  future payload field added or removed would have done the same, silently. A row whose payload
  is missing or unparseable now counts as a match, so an unreadable row suppresses rather than
  admits. Without the guard a job slower than its own cadence gains a queue row
  on every tick and the backlog grows without bound — reachable in practice since cadence became
  operator-editable (§8.1), whose 10 s floor is well under a real catalogue import. A skipped
  tick is logged (`ticker.skippedStillActive`), because silently dropping every tick is
  indistinguishable from the job never running.
- **Graceful shutdown**: stop claiming, finish in-flight work, flush pending batches, release
  locks. Never drop a queued submission on shutdown (doc 09 §6).

### 8.1 Operator-configurable cadence (R-JOB-2)

Every job in §1 with a cadence at all (every one except `ImportBundles`, which has none — see
§1.1) accepts an operator-supplied override from the Jobs screen (doc 06 §7,
`GET`/`POST`/`DELETE /api/jobs/cadence`). An override is stored in `app_settings`
(`job.<jobName>.cadenceMs`, doc 08 §12) audited like any other setting; deleting it restores the
catalogue default. A floor (`MIN_JOB_CADENCE_MS`, 10 s) rejects an accidental near-zero value —
below the fastest catalogue default (`SubmitPriceChanges` at 30 s) is very likely a typo, not an
intentional choice.

**Takes effect on the worker's next restart, not live.** `apps/worker/src/index.ts` resolves
every job's effective cadence once at boot (`getJobCadenceMs`, `packages/jobs/src/job-catalog.ts`)
and uses that value for the process's lifetime — the same startup-time-read semantics the scrape
rate limit and marketplace credentials already use. The Jobs screen says so next to the field so
an operator does not expect an edit to change what fires immediately.

The worker reports the cadences it actually booted with (`WorkerHandle.cadenceMsByJobName`), and
the Jobs screen computes *Sonraki Çalışma* from those rather than from `app_settings`. Without
that the screen contradicted itself: saving an override moved the predicted time immediately, in
the column next to the note saying the change needed a restart. Where the saved value and the
running one disagree the row is badged (doc 06 §7.3) — the state is derived on the server, so it
survives a reload rather than vanishing with a transient "Kaydedildi".

**Applying it: the restart button, not a PowerShell prompt** (`POST /api/jobs/worker/restart`,
doc 06 §7.3). It restarts the *worker* — `shutdown()` then `startWorker()`, in place — and not
the `BuyBoxApp` service. The web half and the worker share one process (doc 14 §3,
`SINGLE_PROCESS=1`), so stopping the service would drop the connection carrying the response and
leave the operator unable to tell whether it came back; restarting the worker keeps the UI up and
returns a real outcome. Every value read at worker boot is re-read — cadence and the scrape rate
limit alike — so this is the documented way to apply either. In-flight jobs are drained, not
killed (`Scheduler.shutdown`). Environment-level configuration (`.env.local`, the service's own
variables) belongs to the Next.js process and still needs a real service restart.

---

## 9. Kill switches

Three levels, all immediate and all visible in the UI:

| Level | Effect |
|-------|--------|
| Global | No outbound price change on any marketplace |
| Per marketplace | No outbound price change on that marketplace |
| Per listing | `reprice_enabled = 0` |

A kill switch stops **submission**, not observation. Decisions continue to be computed and
recorded so the operator can see what the engine would do — this doubles as dry-run mode.

---

## 10. Shadow / dry-run mode

`Reprice` accepts `mode: 'live' | 'shadow'`. In shadow mode decisions are computed and persisted
with `price_submissions.state = 'cancelled'` and a `shadow` marker, but nothing is submitted.

Used for:
- the Phase 4 cutover comparison (doc 10 §11),
- letting the operator try a policy change safely,
- reproducing a past decision after a complaint.

---

## 11. Failure semantics summary

| Failure | Behaviour |
|---------|-----------|
| Cost unknown for a listing | Listing excluded, `CostUnknown` recorded, alert |
| Buybox observation missing/stale | `InsufficientData`, no decision, listing retried next cycle |
| Scrape fails | Reporting gap only; repricing unaffected; failure rate alerts |
| Submission transport failure | Retry with backoff; budget not consumed |
| Submission business rejection | Classified per doc 03 §7.1; bounds updated; alert; no retry |
| Confirmation never reaches terminal state | After a timeout (shorter than Trendyol's 4-hour result retention) mark `failed`, alert, clear pending so the listing is not stuck |
| Worker crash | Locks expire, jobs return to `ready`, in-flight submissions are reconciled by `ConfirmSubmissions` on restart |
| Database unreachable | Worker halts and alerts; no partial writes |

> The confirmation timeout matters: Trendyol retains batch results for only **4 hours**
> (doc api-references §1.4). A submission not confirmed inside that window can never be
> confirmed and must be reconciled by re-reading the listing's actual current price.

---

## 12. Requirements

| ID | Requirement |
|----|-------------|
| R-JOB-1 | Automation runs in a supervised worker, independent of any UI session |
| R-JOB-2 | Every job has a configurable schedule (§8.1) and concurrency limit (`repricing_policies.concurrency`, §8) |
| R-JOB-3 | Work is distributed by a queue, never by array-index splitting |
| R-JOB-4 | Per-marketplace, per-domain rate limiting with retry, backoff and a circuit breaker |
| R-JOB-5 | Imports are idempotent upserts with a stale sweep gated on full success |
| R-JOB-6 | Submissions are batched to the marketplace maximum and confirmed to a terminal state |
| R-JOB-7 | Audit records reach `confirmed` only after the marketplace confirms |
| R-JOB-8 | Cancellation and shutdown flush pending batches |
| R-JOB-9 | Every run records start, end, counts and outcome, visible in the UI |
| R-JOB-10 | Global, per-marketplace and per-listing kill switches take effect immediately |
| R-JOB-11 | Daily update budget is tracked and enforced by decision priority |
| R-JOB-12 | Observation frequency is tiered by listing state and value |
| R-JOB-13 | Scraping is isolated; its failure never blocks repricing |
| R-JOB-14 | Shadow mode computes and records decisions without submitting |
