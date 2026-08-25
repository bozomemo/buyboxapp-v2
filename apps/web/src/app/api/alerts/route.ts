/**
 * Competitor alerts (doc 06 §6.2, doc 12 Phase 10C).
 *
 * Returns the open alerts **and the freshness of the data behind them**, together, on purpose.
 * An alert count on its own is a dangerous number: zero open alerts with a scraper that has not
 * succeeded in two days is not "all clear", it is "we have not looked", and those read
 * identically unless the screen is given both.
 */
import { NextResponse } from 'next/server';
import {
  alertsRepo,
  catalogRepo,
  competitorReportsRepo,
  competitorSellersRepo,
  configRepo,
  listingsRepo,
} from '@buybox/db';
import { ALERT_DEFAULT_QUIET_PERIOD_MS, ALERT_STALE_AFTER_MS } from '@buybox/jobs';
import { withBrand } from '@/lib/product-name';
import { getAppDb } from '@/lib/server/db';

const COVERAGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = (params.get('state') ?? 'open') as 'open' | 'resolved' | 'all';
  const appDb = getAppDb();
  const nowMs = Date.now();

  const [alerts, rules, marketplaces, sellers, sellerGroups] = await Promise.all([
    alertsRepo.listAlerts(appDb, state),
    alertsRepo.listAlertRules(appDb),
    configRepo.listMarketplaces(appDb),
    // The rule editor's pickers. Sellers come from the durable `competitor_sellers` table
    // rather than from a report window: a rule targeting a seller last seen two months ago is
    // still a valid rule, and offering only recently-active sellers would quietly make the
    // long-tail ones unselectable.
    competitorSellersRepo.listCompetitorSellers(appDb),
    competitorSellersRepo.listSellerGroups(appDb),
  ]);

  // Freshness per marketplace, because they scrape on their own cadences and fail
  // independently — one being blocked must not be averaged away by the other working.
  const staleness = await Promise.all(
    marketplaces.map(async (m) => {
      const coverage = await competitorReportsRepo.coverageInRange(appDb, {
        sinceMs: nowMs - COVERAGE_WINDOW_MS,
        untilMs: nowMs,
        marketplaceCode: m.code,
      });
      const ageMs = coverage.lastOkAt === null ? null : nowMs - coverage.lastOkAt;
      return {
        marketplaceCode: m.code,
        displayName: m.displayName,
        lastOkAt: coverage.lastOkAt,
        ageMs,
        ok: coverage.ok,
        failed: coverage.parseFailed + coverage.fetchFailed,
        stale: ageMs === null || ageMs > ALERT_STALE_AFTER_MS,
      };
    }),
  );

  // Alerts name a listing; the screen needs to name a product. Listing-scoped *rules* need the
  // same resolution, or a list of five rules on five different products reads as five identical
  // rows saying "Tek ilan".
  const listingIds = [
    ...new Set([
      ...alerts.map((a) => a.listingId),
      ...rules.filter((r) => r.scopeType === 'listing' && r.scopeValue).map((r) => r.scopeValue!),
    ]),
  ];
  const listings = await Promise.all(listingIds.map((id) => listingsRepo.getListing(appDb, id)));
  const listingById = new Map(
    listings.filter((l) => l !== undefined).map((l) => [l.id, l]),
  );
  const brandNames = await catalogRepo.brandNamesByListingIds(appDb, listingIds);
  /** `Marka - Ürün Adı` (customer feedback 2026-08-25) — see `withBrand`. */
  function productLabel(listingId: string | null | undefined): string | undefined {
    const listing = listingId === null || listingId === undefined ? undefined : listingById.get(listingId);
    if (!listing) return undefined;
    return withBrand(listing.productName, brandNames.get(listing.id));
  }
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  const marketplaceName = new Map(marketplaces.map((m) => [m.code, m.displayName]));
  const groupName = new Map(sellerGroups.map((g) => [g.id, g.displayName]));

  /**
   * What the rule points at, in words. Resolved here rather than in the browser because a
   * dangling reference must be *visible*: a rule whose listing was archived away still lists
   * cleanly and silently never fires, and "(bulunamadı)" on the screen is the only warning the
   * operator gets.
   */
  function scopeLabel(rule: (typeof rules)[number]): string {
    switch (rule.scopeType) {
      case 'all':
        return 'Tüm ürünler';
      case 'marketplace':
        return marketplaceName.get(rule.scopeValue ?? '') ?? `${rule.scopeValue} (bulunamadı)`;
      case 'listing':
        return productLabel(rule.scopeValue) ?? '(ilan bulunamadı)';
      case 'baseStockCode':
        return `Stok ${rule.scopeValue}`;
      default:
        return rule.scopeValue ?? '—';
    }
  }

  function subjectLabel(rule: (typeof rules)[number]): string {
    if (rule.subjectType === 'any') return 'Herhangi bir satıcı';
    if (rule.subjectType === 'sellerGroup') {
      return groupName.get(rule.subjectValue ?? '') ?? '(grup bulunamadı)';
    }
    const matching = sellers.filter((s) => s.sellerRef === rule.subjectValue);
    if (matching.length === 0) return `${rule.subjectValue} (henüz görülmedi)`;
    return matching[0]!.sellerName || (rule.subjectValue ?? '—');
  }

  return NextResponse.json({
    alerts: alerts.map((a) => {
      const listing = listingById.get(a.listingId);
      const rule = rulesById.get(a.ruleId);
      return {
        id: a.id,
        ruleId: a.ruleId,
        ruleName: rule?.name ?? '(silinmiş kural)',
        listingId: a.listingId,
        productName: productLabel(a.listingId) ?? '(bilinmeyen ilan)',
        marketplaceCode: listing?.marketplaceCode ?? null,
        ourPrice: listing?.price?.toString() ?? null,
        state: a.state,
        firstSeenAt: a.firstSeenAt,
        lastSeenAt: a.lastSeenAt,
        resolvedAt: a.resolvedAt,
        thresholdApplied: a.thresholdApplied?.toString() ?? null,
        // Only sellers that have not left: the departed ones stay in the row for history but
        // an open alert is about who is breaching it *now*.
        sellers: a.sellers
          .filter((s) => s.leftAt === null)
          .map((s) => ({
            sellerRef: s.sellerRef,
            sellerName: s.sellerName,
            observedPrice: s.observedPrice?.toString() ?? null,
            priceSource: s.priceSource,
            rank: s.rank,
            promotionText: s.promotionText,
            joinedAt: s.joinedAt,
          })),
        departedSellers: a.sellers.filter((s) => s.leftAt !== null).length,
      };
    }),
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
      scopeLabel: scopeLabel(r),
      subjectType: r.subjectType,
      subjectValue: r.subjectValue,
      subjectLabel: subjectLabel(r),
      predicate: r.predicate,
      thresholdType: r.thresholdType,
      thresholdValue: r.thresholdValue?.toString() ?? null,
      thresholdPct: r.thresholdPct,
      quietPeriodMs: r.quietPeriodMs,
      enabled: r.enabled,
    })),
    staleness,
    staleAfterMs: ALERT_STALE_AFTER_MS,
    options: {
      marketplaces: marketplaces.map((m) => ({ code: m.code, displayName: m.displayName })),
      sellers: sellers.map((s) => ({
        marketplaceCode: s.marketplaceCode,
        sellerRef: s.sellerRef,
        sellerName: s.sellerName,
        groupId: s.groupId,
        lastSeenAt: s.lastSeenAt,
      })),
      sellerGroups: sellerGroups.map((g) => ({ id: g.id, displayName: g.displayName })),
      defaultQuietPeriodMs: ALERT_DEFAULT_QUIET_PERIOD_MS,
    },
  });
}
