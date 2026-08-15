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
import { competitionRepo, configRepo, eventsRepo, listingsRepo, repricingRepo } from '@buybox/db';
import { marketplaceKillSwitchSetting } from '@buybox/jobs';
import {
  GLOBAL_KILL_SWITCH_SETTING_KEY,
  isKillSwitchEngaged,
  isMarketplaceKillSwitchEngaged,
  SYSTEM_PAUSE_SETTING_KEY,
} from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';

function usageDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export async function GET() {
  const appDb = getAppDb();
  const nowMs = Date.now();

  const [marketplaces, globalKillSwitch, systemPause, phaseDistribution, alerts, decisions, lastImport, lastBuybox] =
    await Promise.all([
      configRepo.listMarketplaces(appDb),
      configRepo.getAppSetting(appDb, GLOBAL_KILL_SWITCH_SETTING_KEY),
      configRepo.getAppSetting(appDb, SYSTEM_PAUSE_SETTING_KEY),
      repricingRepo.getPhaseDistribution(appDb),
      eventsRepo.listRecentEvents(appDb, 20, 'warn'),
      repricingRepo.listRecentDecisions(appDb, 15),
      listingsRepo.lastImportByMarketplace(appDb),
      competitionRepo.lastBuyboxObservationByMarketplace(appDb),
    ]);

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

  return NextResponse.json({
    // Two genuinely separate states — see /api/system-pause's and /api/kill-switch's doc
    // comments. `systemPaused` stops everything; `globalKillSwitchEngaged` stops only
    // SubmitPriceChanges. Neither is derived from the other.
    systemPaused: isKillSwitchEngaged(systemPause?.value),
    globalKillSwitchEngaged: isKillSwitchEngaged(globalKillSwitch?.value),
    marketplaces: marketplaceInfo,
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
      productName: d.productName,
      oldPrice: d.oldPrice.toString(),
      newPrice: d.newPrice.toString(),
      reason: d.reason,
      explanation: d.explanation,
      state: d.state,
      decidedAt: d.decidedAt,
    })),
  });
}
