/**
 * Dashboard aggregate feed (doc 06 §2, doc 12 6.4). One call assembles everything the
 * dashboard needs: kill switch states, per-marketplace budget, phase distribution, recent
 * alerts, marketplace health and recent decisions.
 *
 * Marketplace health note: `reachable` and `scrape failure rate` would need the live
 * circuit-breaker state, which lives in the worker process's in-memory adapters — the web
 * process has no channel to read it. This route reports the two health signals it *can*
 * see from the database (last import, last buybox observation) and reports the other two
 * as `null` ("bilinmiyor") rather than fabricate a value. A future increment could persist
 * circuit-breaker transitions as `app_events` rows so the web process can read them back.
 */
import { NextResponse } from 'next/server';
import {
  alertsRepo,
  brandFindingsRepo,
  brandReportsRepo,
  catalogRepo,
  competitionRepo,
  competitorReportsRepo,
  configRepo,
  eventsRepo,
  listingsRepo,
  repricingRepo,
  trackedProductsRepo,
  watchedBrandsRepo,
} from '@buybox/db';
import { ALERT_STALE_AFTER_MS, marketplaceKillSwitchSetting } from '@buybox/jobs';
import {
  GLOBAL_KILL_SWITCH_SETTING_KEY,
  isKillSwitchEngaged,
  isMarketplaceKillSwitchEngaged,
  SYSTEM_PAUSE_SETTING_KEY,
} from '@buybox/shared';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';

/** The span the brand trend covers. Matches the findings window, so the two agree on "lately". */
const BRAND_TREND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function usageDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function GET() {
  const appDb = getAppDb();
  const nowMs = Date.now();

  const [
    marketplaces,
    globalKillSwitch,
    systemPause,
    phaseDistribution,
    alerts,
    decisions,
    lastImport,
    lastBuybox,
  ] = await Promise.all([
    configRepo.listMarketplaces(appDb),
    configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY),
    configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY),
    repricingRepo.getPhaseDistribution(appDb),
    eventsRepo.listRecentEvents(appDb, 20, 'warn'),
    repricingRepo.listRecentDecisions(appDb, 15),
    listingsRepo.lastImportByMarketplace(appDb),
    competitionRepo.lastBuyboxObservationByMarketplace(appDb),
  ]);

  // The competitor-alert tile. The open count travels with the freshness of the scrape behind
  // it, and never alone: zero open alerts on a scraper that has not succeeded in a day is
  // "we have not looked", which reads as "nothing is wrong" unless the tile says otherwise.
  const openCompetitorAlerts = await alertsRepo.countOpenAlerts(appDb);
  const competitorCoverage = await Promise.all(
    marketplaces.map(async (m) => {
      const coverage = await competitorReportsRepo.coverageInRange(appDb, {
        sinceMs: nowMs - 7 * 24 * 60 * 60 * 1000,
        untilMs: nowMs,
        marketplaceCode: m.code,
      });
      return {
        marketplaceCode: m.code,
        displayName: m.displayName,
        lastOkAt: coverage.lastOkAt,
        stale: coverage.lastOkAt === null || nowMs - coverage.lastOkAt > ALERT_STALE_AFTER_MS,
      };
    }),
  );

  const marketplaceInfo = await Promise.all(
    marketplaces.map(async (m) => {
      const [killSwitch, policy, usage] = await Promise.all([
        configRepo.getAppSetting(appDb, marketplaceKillSwitchSetting(m.code)),
        configRepo.getRepricingPolicy(appDb, m.code),
        repricingRepo.getBudgetUsage(appDb, m.code, usageDateKey(nowMs)),
      ]);
      return {
        code: m.code,
        displayName: m.displayName,
        enabled: m.enabled,
        killSwitchEngaged: isMarketplaceKillSwitchEngaged(killSwitch?.value),
        automationEnabled: policy?.enabled ?? false,
        budget: usage
          ? {
              consumed: usage.consumed,
              allowance: usage.allowance,
              reservePct: policy?.budgetReservePct ?? 0,
            }
          : null,
        health: {
          lastImportAt: lastImport[m.code] ?? null,
          lastBuyboxObservationAt: lastBuybox[m.code] ?? null,
          reachable: null as boolean | null, // see file header note
          scrapeFailureRatePct: null as number | null, // see file header note
        },
      };
    }),
  );

  const decisionBrands = await catalogRepo.brandNamesByListingIds(
    appDb,
    decisions.map((d) => d.listingId),
  );

  /**
   * The brand-owner half of the panel (2026-09-03).
   *
   * The dashboard was entirely seller-shaped — kill switches, budgets, repricing phases — and an
   * install used by a brand owner opened on a screen that said nothing about their brands. This
   * section is `null` when nothing is watched, so a pure repricing install is unchanged.
   *
   * Every figure is one aggregate query, and the section is skipped entirely when there are no
   * watched brands, so the dashboard of an install that does not use the module costs exactly
   * what it did before.
   */
  const watchedBrands = await watchedBrandsRepo.listWatchedBrands(appDb);
  const brandAudit =
    watchedBrands.length === 0
      ? null
      : await (async () => {
          const window = { sinceMs: nowMs - BRAND_TREND_WINDOW_MS, untilMs: nowMs };
          const [counts, coverage, trend, findingsPerBrand] = await Promise.all([
            watchedBrandsRepo.watchedBrandCounts(appDb),
            trackedProductsRepo.referencePriceCoverage(appDb),
            brandReportsRepo.brandDailyTrend(appDb, window),
            Promise.all(
              watchedBrands.map(async (brand) => ({
                brand,
                open: await brandFindingsRepo.openFindings(appDb, brand.id),
              })),
            ),
          ]);
          const countsById = new Map(counts.map((c) => [c.watchedBrandId, c]));
          return {
            windowMs: BRAND_TREND_WINDOW_MS,
            /**
             * Open findings by basis. Split rather than totalled because the two mean different
             * things: `stated` is derived from something an operator wrote down, `measured` from
             * a sample, and one number covering both would rank a threshold nobody has tuned
             * beside a blacklist match somebody entered by hand.
             */
            openFindings: {
              stated: findingsPerBrand.reduce(
                (n, b) => n + b.open.filter((f) => f.basis === 'stated').length,
                0,
              ),
              measured: findingsPerBrand.reduce(
                (n, b) => n + b.open.filter((f) => f.basis === 'measured').length,
                0,
              ),
            },
            brands: findingsPerBrand.map(({ brand, open }) => ({
              id: brand.id,
              label: brand.label,
              marketplaceCode: brand.marketplaceCode,
              productCount: countsById.get(brand.id)?.productCount ?? 0,
              noSellerCount: countsById.get(brand.id)?.noSellerCount ?? 0,
              neverLookedCount: countsById.get(brand.id)?.neverLookedCount ?? 0,
              openFindings: open.length,
              lastSweptAt: brand.lastSweptAt,
            })),
            referencePrice: {
              productsWithPrice: coverage.withPrice,
              productsTotal: coverage.total,
            },
            /**
             * Money as a decimal string, as it crosses every wire in this system. A gap in the
             * series is a day nothing was stored and is left as a gap — see `brandDailyTrend`.
             */
            trend: trend.map((point) => ({
              dayMs: point.dayMs,
              avgPrice: point.avgPrice?.toString() ?? null,
              sellerCount: point.sellerCount,
              productsWithOffers: point.productsWithOffers,
              productsWithoutOffers: point.productsWithoutOffers,
            })),
          };
        })();

  return NextResponse.json({
    brandAudit,
    // Two genuinely separate states — see /api/system-pause's and /api/kill-switch's doc
    // comments. `systemPaused` stops everything; `globalKillSwitchEngaged` stops only
    // SubmitPriceChanges. Neither is derived from the other.
    systemPaused: isKillSwitchEngaged(systemPause?.value),
    globalKillSwitchEngaged: isKillSwitchEngaged(globalKillSwitch?.value),
    marketplaces: marketplaceInfo,
    competitorAlerts: {
      open: openCompetitorAlerts,
      coverage: competitorCoverage,
      staleMarketplaces: competitorCoverage.filter((c) => c.stale).map((c) => c.displayName),
    },
    phaseDistribution,
    alerts: alerts.map((a) => ({
      id: a.id,
      at: a.at,
      level: a.level,
      marketplaceCode: a.marketplaceCode,
      listingId: a.listingId,
      code: a.code,
      message: a.message,
    })),
    recentDecisions: decisions.map((d) => ({
      id: d.id,
      listingId: d.listingId,
      marketplaceCode: d.marketplaceCode,
      // `Marka - Ürün Adı` (customer feedback 2026-08-25) — see `withBrand`.
      productName: withBrand(d.productName, decisionBrands.get(d.listingId)),
      oldPrice: d.oldPrice.toString(),
      newPrice: d.newPrice.toString(),
      reason: d.reason,
      explanation: d.explanation,
      state: d.state,
      decidedAt: d.decidedAt,
    })),
  });
}
