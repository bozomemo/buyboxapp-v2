/**
 * How current the band alarm's data is, per marketplace (doc 17 §5.4).
 *
 * Zero open violations beside a listings lane that has not read anything in hours is "we have
 * not looked", not "all clear". Alarmlar and the dashboard both show this beside the count, and
 * both read it from here so they cannot disagree.
 *
 * Measured from the newest **listings-lane pass** (`scope = 'listed'`) that read at least one card
 * successfully. A pass that only failed is not fresh data. Only marketplaces that have İlanlar
 * cards are reported: a marketplace with nothing to watch has nothing to be stale about.
 */
import { configRepo, trackedProductsRepo, type AppDatabase } from '@buybox/db';
import { BAND_STALE_AFTER_MS } from '@buybox/jobs';

export interface BandStaleness {
  marketplaceCode: string;
  displayName: string;
  /** Epoch ms of the newest successful read, or `null` when there has been none. */
  lastOkAt: number | null;
  stale: boolean;
}

export async function bandStaleness(appDb: AppDatabase, nowMs: number): Promise<BandStaleness[]> {
  const marketplaces = (await configRepo.listMarketplaces(appDb)).filter((m) => m.enabled);
  const rows = await Promise.all(
    marketplaces.map(async (m) => {
      const cards = await trackedProductsRepo.countListedTrackedProducts(appDb, m.code);
      if (cards === 0) return null;
      const pass = await trackedProductsRepo.latestTrackedScrapePass(appDb, m.code, 'listed');
      // An open pass that has read something is current as of its start; a finished one, as of
      // its end. Conservative on purpose: never newer than the reads it stands for.
      const lastOkAt = pass && pass.okCount > 0 ? (pass.finishedAt ?? pass.startedAt) : null;
      return {
        marketplaceCode: m.code,
        displayName: m.displayName,
        lastOkAt,
        stale: lastOkAt === null || nowMs - lastOkAt > BAND_STALE_AFTER_MS,
      };
    }),
  );
  return rows.filter((row): row is BandStaleness => row !== null);
}
