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
 * !! Listings beyond the ceiling are **not** currently picked up on the next cycle, though this
 * comment used to say they were. `listObservableListings` has no `ORDER BY` and takes no offset,
 * so every run selects the same first rows and breaks at the ceiling: above 200 observable
 * listings the remainder are never scraped, with the run still reporting `completed`. Recorded
 * as gap G-2 in doc 07 §4.1 (2026-08-24) with the fix — order by last successful scrape so the
 * ceiling becomes a rotation.
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
