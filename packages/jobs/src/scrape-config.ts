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
 * Listings beyond the ceiling are picked up on the next cycle.
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
