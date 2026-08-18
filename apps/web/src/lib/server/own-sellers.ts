/**
 * Which sellers in the competitor archive are *us*.
 *
 * We are one of the offers on our own listings, so the archive records our own store alongside
 * every genuine competitor — correctly, since a rank is only meaningful among the offers it
 * ranks against. Every seller-*centric* report then has to take us back out, or it puts our own
 * store at the top of the competitor list on 100% of our own listings, by construction.
 *
 * Identity comes from `marketplaces.merchant_ref`, the same field the repricer's own-offer
 * filter uses (doc 03 §6.5). Never from the seller's display name: the scraping guide §8 is
 * explicit that identity is ids only, and matching a store by name would break the moment we
 * renamed it or a competitor picked something similar.
 */
import { competitorReportsRepo, configRepo } from '@buybox/db';
import type { getAppDb } from './db';

export interface OwnSellerDiagnosis {
  readonly marketplaceCode: string;
  readonly displayName: string;
  readonly configuredRef: string | null;
  /** Whether this marketplace was successfully scraped in the window at all. */
  readonly hasArchive: boolean;
  /**
   * Whether the configured ref actually appears in the archive for this marketplace.
   *
   * We sell on our own listings, so our merchant id must show up in their offer lists. If it
   * never does, the configured value is not the id this marketplace publishes — and then the
   * exclusion silently removes nothing, which on screen is indistinguishable from no exclusion
   * at all. Checked rather than assumed, because a wrong id here is invisible everywhere else.
   */
  readonly seenInArchive: boolean;
  /** Our own store's figures in the window, when we can identify it. */
  readonly listingCount: number;
  readonly observationCount: number;
  readonly buyboxCount: number;
}

export interface OwnSellers {
  readonly keys: competitorReportsRepo.SellerKey[];
  readonly diagnosis: OwnSellerDiagnosis[];
  /**
   * Marketplaces that have archive rows but whose own-store id cannot be resolved. These are
   * the ones whose competitor reports are still counting us as a competitor.
   */
  readonly unresolved: OwnSellerDiagnosis[];
}

export async function resolveOwnSellers(
  appDb: ReturnType<typeof getAppDb>,
  window: { sinceMs: number; untilMs: number },
): Promise<OwnSellers> {
  const marketplaces = await configRepo.listMarketplaces(appDb);

  const keys = marketplaces
    .filter((m) => m.merchantRef !== null && m.merchantRef.trim() !== '')
    .map((m) => ({ marketplaceCode: m.code, sellerRef: m.merchantRef!.trim() }));

  // One query for all of them, restricted to our own stores — the same aggregation the
  // competitor list runs with the opposite filter, so the two can never disagree about what
  // counts as us.
  const ownAggregates =
    keys.length === 0
      ? []
      : await competitorReportsRepo.sellerAggregatesInRange(appDb, {
          sinceMs: window.sinceMs,
          untilMs: window.untilMs,
          onlySellers: keys,
        });
  const ownByKey = new Map(ownAggregates.map((a) => [`${a.marketplaceCode}::${a.sellerRef}`, a]));

  const diagnosis = await Promise.all(
    marketplaces.map(async (m) => {
      const configuredRef =
        m.merchantRef !== null && m.merchantRef.trim() !== '' ? m.merchantRef.trim() : null;
      const own = configuredRef === null ? undefined : ownByKey.get(`${m.code}::${configuredRef}`);
      // A marketplace nobody has scraped is not misconfigured, it is unobserved. Judging it
      // would put a permanent warning on the screen that no action can clear.
      const coverage = await competitorReportsRepo.coverageInRange(appDb, {
        sinceMs: window.sinceMs,
        untilMs: window.untilMs,
        marketplaceCode: m.code,
      });
      return {
        marketplaceCode: m.code,
        displayName: m.displayName,
        configuredRef,
        hasArchive: coverage.ok > 0,
        seenInArchive: own !== undefined,
        listingCount: own?.listingCount ?? 0,
        observationCount: own?.observationCount ?? 0,
        buyboxCount: own?.buyboxCount ?? 0,
      };
    }),
  );

  return {
    keys,
    diagnosis,
    unresolved: diagnosis.filter((d) => d.hasArchive && !d.seenInArchive),
  };
}
