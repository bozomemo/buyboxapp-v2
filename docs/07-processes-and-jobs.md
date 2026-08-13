# 07 — Processes & Jobs (target specification)

Implementation home: `packages/jobs` (definitions) and `apps/worker` (host).

Automation runs in a supervised worker process, independent of any UI session. Locally the
worker can be embedded in the web process (`SINGLE_PROCESS=1`, doc 10 §1.1); the job code is
identical either way.

---

## 1. Job inventory

| Job | Default cadence | Purpose |
|-----|-----------------|---------|
| `ImportStockItems` | on demand + daily | Pull products/costs from the configured `IProductSource` |
| `ImportBundles` | daily | Rebuild bundle definitions |
| `ImportListings` | per marketplace, 30 min | Full listing sync: price, stock, commission, VAT, status |
| `ObserveBuybox` | per marketplace, tiered (§4) | Official buybox API → `buybox_observations` |
| `ScrapeCompetitors` | tiered, slower | Full seller detail → `scrape_runs` + `competitor_observations` |
| `Reprice` | per marketplace, policy interval | Decide; enqueue `price_submissions` |
| `SubmitPriceChanges` | continuous | Drain the outbox in marketplace-sized batches |
| `ConfirmSubmissions` | continuous | Poll batch status to a terminal state |
| `ResetBudget` | daily, marketplace midnight | Roll `update_budget_usage` |
| `PruneHistory` | nightly | Apply retention (doc 05 §10) |
| `ImportOrders` | — | **MAY-ADD-LATER** |

Every run writes a `job_runs` row and carries a correlation id through every log line.

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
- The request shape for Trendyol's faster public endpoint is pending from the product owner
  (doc api-references §1.6).

---

## 8. Scheduling and concurrency

The scheduler is DB-backed (doc 10 §1.2). Guarantees:

- **One scheduler at a time.** A lock row with a heartbeat; a second instance waits.
- **One run per job at a time**, unless the job declares itself parallel-safe.
- **Per-marketplace concurrency limits** from `repricing_policies.concurrency`.
- **Visibility timeout**: a claimed job whose lock expires is returned to `ready`.
- **Bounded retries** with backoff; exhausted jobs move to `failed` and alert.
- **Graceful shutdown**: stop claiming, finish in-flight work, flush pending batches, release
  locks. Never drop a queued submission on shutdown (doc 09 §6).

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
| R-JOB-2 | Every job has a configurable schedule and concurrency limit |
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
