/**
 * Scraping tunables (doc 07 §7, doc 08). **None of these come from a published marketplace
 * figure** — the public product page has no documented quota — so they are deliberately
 * conservative defaults, disclosed as such here and in doc 08 rather than buried at a call
 * site. Scraping is reporting: being slow costs nothing, being aggressive risks a block and
 * breaches the "explicit business decision" condition in api-references §1.6.
 */

/** `ScrapeCompetitors` runs hourly; the tier multipliers below are expressed in those cycles. */
export const SCRAPE_CYCLE_MS = 60 * 60_000;

/** doc 07 §4: Hot every cycle, Warm daily, Cold weekly, Frozen never. */
export const SCRAPE_WARM_EVERY_N_CYCLES = 24;
export const SCRAPE_COLD_EVERY_N_CYCLES = 168;

/**
 * Ceiling on pages fetched per run, so one cycle can never turn into an unbounded crawl of the
 * whole catalogue — the legacy scraper's dominant cost and main fragility (doc 04 §1.5).
 *
 * Listings beyond the ceiling are picked up on the next cycle, because `scrapeCompetitors`
 * sorts its candidates by last **successful** scrape (oldest first, never-scraped first) before
 * applying this ceiling — so the cut-off rotates through the catalogue rather than falling in
 * the same place every run.
 *
 * That ordering is the whole reason the ceiling is safe. Without it — the state until
 * 2026-08-26, recorded as gap G-2 in doc 07 §4.1 — every run selected the same first rows in
 * whatever order the engine returned them, and above 200 observable listings the remainder were
 * never scraped at all, with the run still reporting `completed`.
 */
export const SCRAPE_MAX_LISTINGS_PER_RUN = 200;

/**
 * doc 07 §7: "the failure **rate** raises an alert, not each individual failure". Below the
 * sample floor the rate is noise, so no alert is raised at all.
 */
export const SCRAPE_FAILURE_RATE_ALERT_THRESHOLD = 0.25;
export const SCRAPE_FAILURE_RATE_MIN_SAMPLE = 10;

/**
 * How old scraped competitor data may be before the seller-identity trigger stops trusting it
 * (doc 03 §6.5: the trigger "degrades gracefully", and stale identity is worse than none —
 * it would re-probe a converged listing against a competitor who has since left).
 */
export const SELLER_IDENTITY_MAX_AGE_MS = 48 * 60 * 60_000;

/**
 * How long a marketplace's competitor data may go without a **successful** scrape before the
 * alert surface says so (doc 06 §6.2, doc 12 Phase 10C).
 *
 * This exists because the most likely failure of an alerting system is not a false alarm but a
 * silent one: the scraper is off, blocked or crashed, the dashboard shows zero open alerts, and
 * that reads as good news. The live archive made the point — 128 consecutive failures in a
 * single hour, and a 52% failure rate overall before Playwright landed.
 *
 * Measured from `scrape_runs.status = 'ok'` only. A job failing every hour is not fresh data.
 */
export const ALERT_STALE_AFTER_MS = 24 * 60 * 60_000;

/**
 * Default silence window for a newly created alert rule (doc 08).
 *
 * Applies only to **re-opening**: once an alert resolves, the same condition on the same
 * listing will not open a fresh alert until this has passed. It does not suppress an alert
 * that is still open, and it never suppresses the first one.
 *
 * Six hours is a compromise the operator can override per rule. Zero would let a competitor
 * oscillating around a threshold generate a new alert row on every scrape cycle — hourly on a
 * hot listing — and bury the alerts that matter. Much longer, and a genuine second incursion
 * the day after the first would go unrecorded.
 */
export const ALERT_DEFAULT_QUIET_PERIOD_MS = 6 * 60 * 60_000;

/**
 * How many products one `SweepTrackedProducts` chunk reads before the pass asks the database
 * for the next page (doc 07 §7.4).
 *
 * There is **no per-run ceiling on the tracked sweep any more**, and that is the point of the
 * pass model: a pass is every active product of a marketplace, walked until none is left, and
 * then opened again. The ceiling this constant replaces (`SCRAPE_MAX_TRACKED_PER_RUN`, 300)
 * made a full lap of the live install's 4,679 rows take a little under sixteen hours, and
 * reported "300 items" on a screen whose reader wanted to know how far through the catalogue
 * the system was.
 *
 * Removing a ceiling is only safe because the thing it was protecting against is now structurally
 * impossible. What killed the uncapped run on 2026-08-28 was not its length — it was that the run
 * had no cursor, so a worker restart or a visibility-timeout requeue started the catalogue again
 * from the top and the job never reached its own end. The pass cursor (`tracked_scrape_passes`)
 * fixes exactly that: work already done is durable in `last_scraped_at`, so a restart resumes.
 *
 * The chunk is the granularity at which three things happen: the candidate query is re-run (so
 * products a sweep added, or an operator paused, mid-pass are honoured), the pass row's counters
 * are advanced (so progress survives a restart), and `SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT`
 * is evaluated. A hundred at the conservative rate is a few minutes' work.
 */
export const SCRAPE_TRACKED_CHUNK = 100;

/**
 * How many tracked products a pass reads **at once**.
 *
 * The rate limiter has always allowed 30 requests a minute (`TRENDYOL_SCRAPE_DEFAULTS`), but the
 * sweep could never spend that budget: the Playwright fetcher drove a single Chromium page and
 * queued every fetch behind the one before it, so throughput was one page load — 8-15 s on the
 * operator's machine — not one rate-limit token. Measured against the live install that is
 * ~250-450 products an hour, which is why raising the old per-run ceiling on its own would have
 * changed nothing at all.
 *
 * **This does not raise the request rate.** The ceiling is still the operator's configured
 * `requestsPerMinute`, enforced by one shared limiter inside the source; concurrency only lets
 * the sweep reach a budget it was already granted. Matched to `PAGE_POOL_SIZE` in
 * `playwright-fetch.ts` — asking for more concurrent products than there are pages to serve them
 * buys nothing but a longer queue.
 */
export const SCRAPE_TRACKED_CONCURRENCY = 3;

/**
 * How many tracked products may fail **in a row** before the tracked half gives up on the run.
 *
 * Individual failures are ordinary and silent (doc 07 §7), but a long unbroken run of them is a
 * different fact: the source is gone, not the page. The case this was written for is a headless
 * browser that died mid-run — every later fetch failed instantly with `Target page, context or
 * browser has been closed` while still spending a rate-limit token and writing a failure row,
 * for the whole remainder of the catalogue (2,700 products on 2026-08-28).
 *
 * Stopping costs nothing: the products not reached keep their old `last_scraped_at` and are
 * therefore first in the next run's ordering, which is exactly where they belong.
 */
export const SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT = 25;

/**
 * How many products one `ScrapeBrandSellers` chunk reads before the job asks the database for
 * the next page (doc 07 §7.3).
 *
 * The job is a loop over `scrapeTrackedProducts`, and the chunk size is the granularity at
 * which two things happen: the candidate query is re-run (so products the sweep added, or an
 * operator paused, mid-run are honoured), and `SCRAPE_TRACKED_CONSECUTIVE_FAILURE_LIMIT` is
 * evaluated. Fifty at the conservative rate is a couple of minutes' work — small enough that a
 * dead source is noticed quickly, large enough that a five-thousand-product brand costs a
 * hundred queries rather than five thousand.
 */
export const SCRAPE_BRAND_SELLERS_CHUNK = 50;

/**
 * Runaway guard on one whole-brand seller scrape — **not** a rotation cap.
 *
 * Unlike the cadence sweep, nothing comes back for the remainder here: the operator pressed a
 * button that means "read this entire brand", and Royal Canin alone is 5,204 rows. So
 * the ceiling sits far above any brand measured (20,000) and exists only so that a bug which
 * stopped `last_scraped_at` advancing costs one long run rather than an endless one. Hitting it
 * is recorded as a truncated run, never silently accepted.
 */
export const SCRAPE_BRAND_SELLERS_MAX_PRODUCTS = 20_000;
