/**
 * Operator-configurable pacing for the reporting-only scrapers (doc 07 §7, doc 08 §12). The
 * defaults baked into `TrendyolPublicPageSource`/`HepsiburadaPublicListingsSource`
 * (`TRENDYOL_SCRAPE_DEFAULTS`/`HEPSIBURADA_SCRAPE_DEFAULTS`, `@buybox/adapters`) are
 * deliberately conservative *guesses* — neither marketplace publishes a quota — and until now
 * changing them meant editing a constant and redeploying. This persists an operator's own
 * choice in `app_settings`, read once at worker startup (`buildCompetitorSources`) alongside
 * every other integration setting.
 *
 * A stricter-than-default value always applies immediately to *future* requests: the token
 * bucket in `RateLimiter` only ever grants what its configured `refillPerMs` allows, so there
 * is no risk of a stored value being "too late" to help after a burst of 403s — the very next
 * request already obeys it once the worker is restarted with the new setting.
 */
import type { AppDatabase } from '@buybox/db';
import { configRepo } from '@buybox/db';
import type { MarketplaceCode } from '@buybox/core';

export interface ScrapeRateLimit {
  readonly requestsPerMinute: number;
  readonly burst: number;
  /**
   * How long a single page request may take before it is abandoned, in milliseconds, or
   * `undefined` to leave each source on its own compiled default (added 2026-09-11).
   *
   * Stored beside the rate because it answers the same question — *how hard may this machine
   * push, and how long may it wait* — and is set from the same screen at the same moment. It is
   * emphatically **not** a rate: `RateLimiter` never sees it; it is handed to each source as
   * `requestTimeoutMs`.
   *
   * It exists because the right value is a property of the operator's machine and its link,
   * which nothing in this repository can know. On the production install
   * `page.goto: Timeout 15000ms exceeded` was the most common recurring failure in the event
   * log while the marketplace was answering everyone else normally — a machine too slow for a
   * developer-machine constant, and until now only a redeploy could say so.
   *
   * Optional on purpose: a stored setting written before this existed carries no value, and
   * "no value" must keep meaning "each source's own default" rather than zero.
   */
  readonly requestTimeoutMs?: number;
}

/**
 * Guard rails for a value an operator types. The lower bound is a slow page, not a fast one —
 * below a couple of seconds every request on a heavy SPA fails and the scrape simply stops
 * working; the upper bound stops a typo from parking a worker slot for an hour.
 */
export const SCRAPE_TIMEOUT_MIN_MS = 2_000;
export const SCRAPE_TIMEOUT_MAX_MS = 120_000;

/**
 * Ceilings on the rate itself, **added 2026-09-25**. Nothing stopped 100,000 requests a minute
 * from being saved — one mistyped digit away from the burst pattern that gets an address blocked
 * (api-references §1.6). Two a second is four times the compiled Trendyol default and twice the
 * fastest rate a live install has chosen (60/min). Enforced when saved (the route answers 400)
 * and again when read, where a stored value above it is clamped rather than dropped: the operator
 * asked for *fast*, and falling back to the default would quietly do something else.
 */
export const SCRAPE_RATE_MAX_PER_MINUTE = 120;
export const SCRAPE_BURST_MAX = 20;

export function scrapeRateSettingKey(marketplaceCode: MarketplaceCode): string {
  return `scrape.${marketplaceCode}.rateLimit`;
}

/** `undefined` means "no override stored" — the caller falls back to its own compiled default. */
export async function getScrapeRateLimit(
  appDb: AppDatabase,
  marketplaceCode: MarketplaceCode,
): Promise<ScrapeRateLimit | undefined> {
  const setting = await configRepo.getAppSetting(appDb, scrapeRateSettingKey(marketplaceCode));
  if (!setting) return undefined;
  try {
    const parsed = JSON.parse(setting.value) as Partial<ScrapeRateLimit>;
    if (
      typeof parsed.requestsPerMinute === 'number' &&
      parsed.requestsPerMinute > 0 &&
      typeof parsed.burst === 'number' &&
      parsed.burst > 0
    ) {
      // An out-of-range or non-numeric timeout is dropped rather than failing the whole
      // setting: the rate is the part a run cannot proceed without, and a source with no
      // override simply keeps its own default.
      const timeout =
        typeof parsed.requestTimeoutMs === 'number' &&
        parsed.requestTimeoutMs >= SCRAPE_TIMEOUT_MIN_MS &&
        parsed.requestTimeoutMs <= SCRAPE_TIMEOUT_MAX_MS
          ? parsed.requestTimeoutMs
          : undefined;
      return {
        requestsPerMinute: Math.min(parsed.requestsPerMinute, SCRAPE_RATE_MAX_PER_MINUTE),
        burst: Math.min(parsed.burst, SCRAPE_BURST_MAX),
        ...(timeout === undefined ? {} : { requestTimeoutMs: timeout }),
      };
    }
    return undefined;
  } catch {
    // Malformed stored value behaves as "no override" rather than failing worker startup.
    return undefined;
  }
}

export async function setScrapeRateLimit(
  appDb: AppDatabase,
  marketplaceCode: MarketplaceCode,
  limit: ScrapeRateLimit,
  updatedBy: string,
  nowMs: number,
  auditId: string,
): Promise<void> {
  await configRepo.setAppSetting(
    appDb,
    {
      key: scrapeRateSettingKey(marketplaceCode),
      value: JSON.stringify({
        requestsPerMinute: limit.requestsPerMinute,
        burst: limit.burst,
        ...(limit.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: limit.requestTimeoutMs }),
      }),
      updatedBy,
      updatedAt: nowMs,
    },
    auditId,
  );
}
