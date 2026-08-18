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
}

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
      return { requestsPerMinute: parsed.requestsPerMinute, burst: parsed.burst };
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
      value: JSON.stringify(limit),
      updatedBy,
      updatedAt: nowMs,
    },
    auditId,
  );
}
