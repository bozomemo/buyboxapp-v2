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
 * Ceiling on **tracked products** read per `ScrapeCompetitors` run, and the reason the tracked
 * half rotates the same way the listings half does.
 *
 * The tracked set was operator-curated and a few dozen rows when this job was written, so it
 * simply read all of them every cycle. `SweepBrandCatalogue` turned it into a catalogue — 4,679
 * active Trendyol rows on the live install, 2026-08-28 — and at the configured 30 requests per
 * minute that is over two hours of fetching inside an hourly job. Measured that day: the run
 * never reached its own end, the next cycle was suppressed by `countActiveJobs`, and an earlier
 * one had already died at `worker stopped responding (visibility timeout expired)` after 19
 * hours. Competitor collection had stopped while every screen reported a job in progress.
 *
 * 300 per run against a 4,679-row catalogue is a full pass a little under every sixteen hours,
 * which is well inside the freshness the tracked-product reports are read at. As with
 * `SCRAPE_MAX_LISTINGS_PER_RUN`, the ceiling is only a rotation because the candidates are
 * ordered by last look — never-looked first, then oldest first. Unordered it would read the
 * same 300 rows forever and never touch the rest.
 */
export const SCRAPE_MAX_TRACKED_PER_RUN = 300;

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
